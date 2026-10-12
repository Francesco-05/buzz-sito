<?php
/** Recruitment email only; no access to the commercial CRM. */
declare(strict_types=1);
namespace BuzzCareers;

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function reply(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function field(array $input, string $key, int $min, int $max, bool $multiline = false): string {
    $raw = $input[$key] ?? '';
    if (!is_string($raw)) throw new \InvalidArgumentException('Controlla i campi della candidatura.');
    $value = trim(str_replace(["\r\n", "\r"], "\n", $raw));
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length < $min || $length > $max || preg_match('//u', $value) !== 1 ||
        preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) ||
        (!$multiline && preg_match('/[\r\n]/', $value))) {
        throw new \InvalidArgumentException('Controlla i campi della candidatura.');
    }
    if ($value !== strip_tags($value)) throw new \InvalidArgumentException('Inserisci solo testo, senza codice HTML.');
    return $value;
}

function validate(array $input): array {
    if (($input['fax'] ?? '') !== '') throw new \InvalidArgumentException('Invio non valido.');
    $fields = [];
    foreach (['name'=>[2,100], 'email'=>[3,190], 'phone'=>[5,35], 'city'=>[2,120], 'role'=>[1,50], 'portfolio'=>[8,500], 'presentation'=>[10,2000]] as $key=>$limits) {
        $fields[$key] = field($input, $key, $limits[0], $limits[1], $key === 'presentation');
    }
    if (!filter_var($fields['email'], FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException('Controlla l’indirizzo email.');
    if (!preg_match('/^[+0-9(). -]{5,35}$/D', $fields['phone'])) throw new \InvalidArgumentException('Controlla il numero di telefono.');
    if (!in_array($fields['role'], ['Content Creator', 'Videomaker', 'Graphic Designer'], true)) throw new \InvalidArgumentException('Seleziona uno dei ruoli disponibili.');
    $url = parse_url($fields['portfolio']);
    if (!filter_var($fields['portfolio'], FILTER_VALIDATE_URL) || !is_array($url) ||
        !in_array(strtolower($url['scheme'] ?? ''), ['http','https'], true) ||
        empty($url['host']) || isset($url['user']) || isset($url['pass'])) {
        throw new \InvalidArgumentException('Inserisci un link valido ai tuoi lavori, completo di https://.');
    }
    return $fields;
}

function saveState(string $path, array $state): void {
    $data = "<?php exit; ?>\n" . json_encode($state, JSON_THROW_ON_ERROR);
    if (strlen($data) > 524288) throw new \RuntimeException('State capacity exceeded');
    $temporary = $path . '.' . bin2hex(random_bytes(8)) . '.php';
    $handle = fopen($temporary, 'x');
    if ($handle === false) throw new \RuntimeException('Cannot create state');
    try {
        if (fwrite($handle, $data) !== strlen($data) || !fflush($handle)) throw new \RuntimeException('Cannot persist state');
        if (function_exists('fsync') && !fsync($handle)) throw new \RuntimeException('Cannot sync state');
        if (!fclose($handle)) throw new \RuntimeException('Cannot close state');
        $handle = null;
        if (!rename($temporary, $path)) throw new \RuntimeException('Cannot replace state');
    } finally {
        if (is_resource($handle)) fclose($handle);
        if (is_file($temporary)) unlink($temporary);
    }
}

function uncertain(): array {
    return [503, ['ok'=>false, 'code'=>'delivery_uncertain', 'needsVerification'=>true, 'retryable'=>false, 'safeToRetry'=>false,
        'message'=>'Non possiamo confermare l’esito dell’invio. Per evitare duplicati, scrivi a info@buzzstudio.it prima di inviare una nuova candidatura.']];
}

function sendApplication(array $fields): bool {
    $words = [];
    $chunk = '';
    foreach (preg_split('//u', 'Candidatura BUZZ — ' . $fields['role'] . ' — ' . $fields['name'], -1, PREG_SPLIT_NO_EMPTY) as $character) {
        if (strlen($chunk . $character) > 42) {
            $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
            $chunk = '';
        }
        $chunk .= $character;
    }
    if ($chunk !== '') $words[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
    $subject = implode("\r\n ", $words);
    $body = "Nuova candidatura dal sito BUZZ\n\n" .
        'Ruolo: ' . $fields['role'] . "\nModalità: in presenza in Campania\n\n" .
        'Nome: ' . $fields['name'] . "\nEmail: " . $fields['email'] . "\nTelefono: " . $fields['phone'] .
        "\nCittà / provincia: " . $fields['city'] . "\nLavori / portfolio: " . $fields['portfolio'] .
        "\n\nPresentazione:\n" . $fields['presentation'] . "\n\nInformativa: https://www.buzzstudio.it/privacy/\n";
    $headers = [
        'From'=>'BUZZ Candidature <info@buzzstudio.it>',
        'Reply-To'=>$fields['email'],
        'MIME-Version'=>'1.0',
        'Content-Type'=>'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding'=>'base64',
        'X-Auto-Response-Suppress'=>'All',
    ];
    // The envelope and recipient are fixed; applicant text never enters shell options.
    return mail('info@buzzstudio.it', $subject, chunk_split(base64_encode($body), 76, "\r\n"), $headers, '-finfo@buzzstudio.it');
}

function processApplication(array $fields, string $requestId, bool $expired, string $secret, int $now, string $directory): array {
    $handle = fopen($directory . '/careers-state.lock.php', 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) throw new \RuntimeException('Cannot lock state');
    try {
        $path = $directory . '/careers-state.php';
        $prefix = "<?php exit; ?>\n";
        $state = ['version'=>1, 'day'=>gmdate('Y-m-d', $now), 'total'=>0, 'ips'=>[], 'requests'=>[]];
        if (is_file($path)) {
            $raw = file_get_contents($path, false, null, 0, 524289);
            if (!is_string($raw) || strlen($raw) > 524288 || substr($raw, 0, strlen($prefix)) !== $prefix) throw new \RuntimeException('Invalid state');
            try {
                $stored = json_decode(substr($raw, strlen($prefix)), true, 16, JSON_THROW_ON_ERROR);
            } catch (\JsonException $error) {
                throw new \RuntimeException('Invalid state');
            }
            if (!is_array($stored) || ($stored['version'] ?? null) !== 1 ||
                !is_string($stored['day'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $stored['day']) ||
                !is_int($stored['total'] ?? null) || $stored['total'] < 0 ||
                !is_array($stored['requests'] ?? null) || count($stored['requests']) > 600 ||
                !is_array($stored['ips'] ?? null) || count($stored['ips']) > 600) throw new \RuntimeException('Invalid state');
            foreach ($stored['requests'] as $id=>$request) {
                if (!preg_match('/^[a-f0-9]{32}$/D', (string)$id) || !is_array($request) ||
                    !is_int($request['at'] ?? null) || !is_string($request['fingerprint'] ?? null) ||
                    !preg_match('/^[a-f0-9]{64}$/D', $request['fingerprint']) ||
                    !in_array($request['status'] ?? '', ['sending','accepted','rejected'], true)) throw new \RuntimeException('Invalid state');
            }
            foreach ($stored['ips'] as $key=>$bucket) {
                if (!preg_match('/^[a-f0-9]{64}$/D', (string)$key) || !is_array($bucket) ||
                    !is_int($bucket['at'] ?? null) || !is_int($bucket['count'] ?? null) || $bucket['count'] < 0) throw new \RuntimeException('Invalid state');
            }
            $state = $stored;
        }
        $fingerprint = hash_hmac('sha256', json_encode($fields, JSON_THROW_ON_ERROR), $secret);
        $existing = $state['requests'][$requestId] ?? null;
        if (is_array($existing)) {
            if (!hash_equals($existing['fingerprint'] ?? '', $fingerprint)) {
                return [409, ['ok'=>false, 'code'=>'request_conflict', 'needsVerification'=>true, 'retryable'=>false, 'safeToRetry'=>false,
                    'message'=>'Questo invio contiene dati diversi dal precedente. Per verificarne l’esito, scrivi a info@buzzstudio.it.']];
            }
            if (($existing['status'] ?? '') === 'accepted') return [200, ['ok'=>true]];
            if (($existing['status'] ?? '') !== 'rejected') return uncertain();
        }
        // Resolve previous deliveries before expiry or limits, so a lost response can be retried safely.
        if ($expired) return [403, ['ok'=>false, 'code'=>'token', 'safeToRetry'=>true, 'message'=>'La sessione del modulo è scaduta. Riprova.']];
        $day = gmdate('Y-m-d', $now);
        if (($state['day'] ?? '') !== $day) {
            $state['day'] = $day;
            $state['total'] = 0;
            $state['ips'] = [];
        }
        foreach ($state['requests'] as $id=>$request) {
            if (($request['at'] ?? 0) < $now - 7200) unset($state['requests'][$id]);
        }
        $ipKey = hash_hmac('sha256', 'careers|' . ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $day, $secret);
        $bucket = $state['ips'][$ipKey] ?? ['at'=>$now, 'count'=>0];
        if ($now - $bucket['at'] >= 3600) $bucket = ['at'=>$now, 'count'=>0];
        if ($bucket['count'] >= 5 || $state['total'] >= 150 || count($state['requests']) >= 600) {
            return [429, ['ok'=>false, 'safeToRetry'=>true, 'message'=>'Troppi invii ravvicinati. Riprova più tardi.']];
        }
        $bucket['count']++;
        $state['ips'][$ipKey] = $bucket;
        $state['total']++;
        $state['requests'][$requestId] = ['at'=>$now, 'fingerprint'=>$fingerprint, 'status'=>'sending'];
        // Persist before invoking mail; an interrupted process cannot send the same request twice.
        saveState($path, $state);
        try {
            $accepted = sendApplication($fields);
        } catch (\Throwable $error) {
            // The durable "sending" record deliberately remains unresolved.
            error_log('BUZZ careers transport: ' . get_class($error));
            return uncertain();
        }
        $state['requests'][$requestId]['status'] = $accepted ? 'accepted' : 'rejected';
        try {
            saveState($path, $state);
        } catch (\Throwable $error) {
            error_log('BUZZ careers delivery state: ' . get_class($error));
            return uncertain();
        }
        if (!$accepted) return [503, ['ok'=>false, 'code'=>'mail_rejected', 'safeToRetry'=>true, 'retryable'=>true,
            'message'=>'L’invio non è riuscito. I tuoi dati sono ancora nel modulo: riprova tra poco.']];
        return [200, ['ok'=>true]];
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

// Used only by isolated tests; the public endpoint never defines this constant.
if (defined('BUZZ_CAREERS_LIBRARY_ONLY') && BUZZ_CAREERS_LIBRARY_ONLY === true) return;

try {
    $allowed = ['https://www.buzzstudio.it', 'https://buzzstudio.it'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    $fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if (($origin !== '' && !in_array($origin, $allowed, true)) || ($fetchSite !== '' && !in_array($fetchSite, ['same-origin','same-site','none'], true))) {
        reply(403, ['ok'=>false, 'message'=>'Origine della richiesta non valida.']);
    }
    if (!in_array($method, ['GET','POST'], true)) {
        header('Allow: GET, POST');
        reply(405, ['ok'=>false, 'message'=>'Metodo non consentito.']);
    }
    $directory = __DIR__ . '/private';
    $configPath = $directory . '/config.php';
    if (!is_file($configPath) || !function_exists('mail') || !is_writable($directory)) reply(503, ['ok'=>false, 'message'=>'Le candidature non sono ancora disponibili. Riprova tra poco.']);
    $config = require $configPath;
    $secret = $config['secret'] ?? '';
    if (!is_string($secret) || strlen($secret) < 64) throw new \RuntimeException('Missing configuration');
    $now = time();
    if ($method === 'GET') {
        $part = $now . '.' . bin2hex(random_bytes(16));
        reply(200, ['ok'=>true, 'token'=>$part . '.' . hash_hmac('sha256', 'careers|' . $part, $secret)]);
    }
    if (!in_array($origin, $allowed, true)) reply(403, ['ok'=>false, 'message'=>'Origine della richiesta non valida.']);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') reply(415, ['ok'=>false, 'message'=>'Formato non valido.']);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 16000) reply(413, ['ok'=>false, 'message'=>'Messaggio troppo lungo.']);
    $body = file_get_contents('php://input', false, null, 0, 16001);
    if ($body === false || strlen($body) > 16000) reply(413, ['ok'=>false, 'message'=>'Messaggio troppo lungo.']);
    $input = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($input)) reply(400, ['ok'=>false, 'message'=>'Richiesta non valida.']);
    $token = $input['token'] ?? '';
    if (!is_string($token) || !preg_match('/^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/D', $token, $parts)) reply(403, ['ok'=>false, 'code'=>'token', 'message'=>'Ricarica la pagina e riprova.']);
    if (!hash_equals(hash_hmac('sha256', 'careers|' . $parts[1] . '.' . $parts[2], $secret), $parts[3]) || (int)$parts[1] > $now + 30 || $now - (int)$parts[1] > 7200) {
        reply(403, ['ok'=>false, 'code'=>'token', 'message'=>'La sessione del modulo è scaduta. Riprova.']);
    }
    $fields = validate($input);
    [$status, $response] = processApplication($fields, $parts[2], $now - (int)$parts[1] > 3600, $secret, $now, $directory);
    if ($status === 429) header('Retry-After: 3600');
    reply($status, $response);
} catch (\InvalidArgumentException $error) {
    reply(422, ['ok'=>false, 'message'=>$error->getMessage()]);
} catch (\JsonException $error) {
    reply(400, ['ok'=>false, 'message'=>'Richiesta non valida.']);
} catch (\Throwable $error) {
    // Do not log applicant content, addresses or private configuration.
    error_log('BUZZ careers: ' . get_class($error));
    reply(503, ['ok'=>false, 'safeToRetry'=>false, 'message'=>'Non riusciamo a confermare l’invio. I tuoi dati restano nel modulo: riprova tra poco.']);
}
