<?php
/** BUZZ public contact endpoint. No authentication session or CRM read access. */
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function buzzReply(int $status, array $body): void {
    http_response_code($status);
    $json = (string)json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // A known length lets the browser close the request before the alerts in buzzAfterReply() run.
    header('Content-Length: ' . strlen($json));
    echo $json;
    exit;
}
function buzzField(array $input, string $name, int $min, int $max): string {
    $raw = $input[$name] ?? '';
    if (!is_string($raw)) throw new InvalidArgumentException('Controlla i campi del modulo.');
    $value = trim(str_replace(["\r\n", "\r"], "\n", $raw));
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length < $min || $length > $max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) {
        throw new InvalidArgumentException('Controlla i campi del modulo.');
    }
    // The existing CRM displays plain text. Do not accept HTML markup.
    if ($value !== strip_tags($value)) throw new InvalidArgumentException('Inserisci solo testo, senza codice HTML.');
    return $value;
}
function buzzValidate(array $input): array {
    if (($input['fax'] ?? '') !== '') throw new InvalidArgumentException('Invio non valido.');
    $fields = [];
    foreach (['name'=>[2,100], 'company'=>[2,150], 'email'=>[3,190], 'phone'=>[1,35], 'website'=>[1,300], 'objective'=>[10,2000]] as $name=>$limits) {
        $fields[$name] = buzzField($input, $name, $limits[0], $limits[1]);
    }
    if (!filter_var($fields['email'], FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Controlla l’indirizzo email.');
    if (!preg_match('/^[+0-9().\s-]{5,35}$/', $fields['phone']) || !buzzPhoneLooksRight($fields['phone'])) {
        throw new InvalidArgumentException('Controlla il numero: un cellulare italiano ha 10 cifre (es. 333 123 4567).');
    }
    return $fields;
}
/** Same rule as assets/js/contatti.js: Italian mobile (3 + 8-9 digits) or landline (0...), foreign numbers with the prefix. */
function buzzPhoneLooksRight(string $phone): bool {
    $digits = preg_replace('/\D+/', '', $phone) ?? '';
    $international = (bool)preg_match('/^\s*(\+|00)/', $phone);
    if (str_starts_with($digits, '00')) $digits = substr($digits, 2);
    if ($international && !str_starts_with($digits, '39')) return strlen($digits) >= 8 && strlen($digits) <= 15;
    if ($international || (str_starts_with($digits, '39') && strlen($digits) > 10)) $digits = substr($digits, 2);
    return (bool)preg_match('/^3\d{8,9}$/', $digits) || (bool)preg_match('/^0\d{5,10}$/', $digits);
}
/** Returns the new lead id (0 when the request was already saved). */
function buzzSave(PDO $db, array $fields, string $requestId): int {
    $sourceDetail = 'buzzstudio.it | ' . $requestId;
    $find = $db->prepare('SELECT id FROM leads WHERE source = ? AND source_detail = ? LIMIT 1');
    $find->execute(['Sito web', $sourceDetail]);
    if ($find->fetchColumn()) return 0;
    $notes = "Richiesta dal sito BUZZ\n\n" . $fields['objective'];
    if ($fields['website'] !== '') $notes .= "\n\nSito / social: " . $fields['website'];
    $notes .= "\n\nInformativa: https://www.buzzstudio.it/privacy/ (10-09-2026)";
    $query = $db->prepare('INSERT INTO leads (business_name,contact_name,email,phone,service,status,source,source_detail,notes,priority,next_contact) VALUES (?,?,?,?,?,?,?,?,?,?,CURDATE())');
    $query->execute([$fields['company'], $fields['name'], $fields['email'], $fields['phone'] ?: null, 'BUZZ Content System', 'nuovo contatto', 'Sito web', $sourceDetail, $notes, 'media']);
    return (int)$db->lastInsertId();
}
/**
 * After the visitor has the answer: the management app alerts the team and sends the first email
 * (app/includes/contatti_sito.php, from version 10.120.0). Skipped when that file is not on the server yet.
 */
function buzzAfterReply(PDO $db, int $leadId): void {
    $hook = dirname(__DIR__) . '/app/includes/contatti_sito.php';
    if ($leadId <= 0 || !is_file($hook)) return;
    register_shutdown_function(static function () use ($db, $leadId, $hook): void {
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        else { while (ob_get_level() > 0) @ob_end_flush(); @flush(); }
        try {
            require_once $hook;
            if (function_exists('oftSiteLeadArrived')) oftSiteLeadArrived($db, $leadId);
        } catch (Throwable $e) {
            error_log('BUZZ contact alert: ' . get_class($e));
        }
    });
}

// Only the temporary deployment verification runner defines this constant.
if (defined('BUZZ_CONTACT_LIBRARY_ONLY') && BUZZ_CONTACT_LIBRARY_ONLY === true) return;

try {
    $allowed = ['https://www.buzzstudio.it', 'https://buzzstudio.it'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    $fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if (($origin !== '' && !in_array($origin, $allowed, true)) || ($fetchSite !== '' && !in_array($fetchSite, ['same-origin', 'same-site', 'none'], true))) {
        buzzReply(403, ['ok'=>false, 'message'=>'Origine della richiesta non valida.']);
    }
    if (!in_array($method, ['GET','POST'], true)) {
        header('Allow: GET, POST');
        buzzReply(405, ['ok'=>false, 'message'=>'Metodo non consentito.']);
    }
    $configPath = __DIR__ . '/private/config.php';
    if (!is_file($configPath)) buzzReply(503, ['ok'=>false, 'message'=>'Il servizio di contatto non è ancora disponibile.']);
    $config = require $configPath;
    $secret = $config['secret'] ?? '';
    if (!is_string($secret) || strlen($secret) < 64) throw new RuntimeException('Missing configuration');
    $now = time();
    if ($method === 'GET') {
        $part = $now . '.' . bin2hex(random_bytes(16));
        buzzReply(200, ['ok'=>true, 'token'=>$part . '.' . hash_hmac('sha256', $part, $secret)]);
    }
    if (!in_array($origin, $allowed, true)) buzzReply(403, ['ok'=>false, 'message'=>'Origine della richiesta non valida.']);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') buzzReply(415, ['ok'=>false, 'message'=>'Formato non valido.']);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 16000) buzzReply(413, ['ok'=>false, 'message'=>'Messaggio troppo lungo.']);
    $body = file_get_contents('php://input', false, null, 0, 16001);
    if ($body === false || strlen($body) > 16000) buzzReply(413, ['ok'=>false, 'message'=>'Messaggio troppo lungo.']);
    $input = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($input)) buzzReply(400, ['ok'=>false, 'message'=>'Richiesta non valida.']);
    $token = $input['token'] ?? '';
    if (!is_string($token) || !preg_match('/^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/D', $token, $parts)) buzzReply(403, ['ok'=>false, 'message'=>'Ricarica la pagina e riprova.', 'code'=>'token']);
    if (!hash_equals(hash_hmac('sha256', $parts[1].'.'.$parts[2], $secret), $parts[3]) || (int)$parts[1] > $now + 30 || $now - (int)$parts[1] > 3600) buzzReply(403, ['ok'=>false, 'message'=>'La sessione del modulo è scaduta. Riprova.', 'code'=>'token']);
    $fields = buzzValidate($input);
    $statePath = __DIR__ . '/private/state.php';
    $handle = fopen($statePath, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) throw new RuntimeException('Cannot lock limiter');
    try {
        $raw = stream_get_contents($handle);
        $prefix = "<?php exit; ?>\n";
        $state = $raw === '' ? [] : json_decode(substr($raw, strlen($prefix)), true);
        if (!is_array($state)) throw new RuntimeException('Invalid limiter');
        $day = gmdate('Y-m-d');
        if (($state['day'] ?? '') !== $day) $state = ['day'=>$day, 'total'=>0, 'ips'=>[]];
        $ipKey = hash_hmac('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $day, $secret);
        $bucket = $state['ips'][$ipKey] ?? ['at'=>$now, 'count'=>0];
        if ($now - $bucket['at'] >= 3600) $bucket = ['at'=>$now, 'count'=>0];
        require_once dirname(__DIR__) . '/app/config/database.php';
        $db = getDB();
        $requestId = $parts[2];
        $existing = $db->prepare('SELECT id FROM leads WHERE source = ? AND source_detail = ? LIMIT 1');
        $existing->execute(['Sito web', 'buzzstudio.it | ' . $requestId]);
        if ($existing->fetchColumn()) buzzReply(200, ['ok'=>true]);
        if ($bucket['count'] >= 5 || $state['total'] >= 150) {
            header('Retry-After: 3600');
            buzzReply(429, ['ok'=>false, 'message'=>'Troppi invii ravvicinati. Riprova più tardi.']);
        }
        $db->beginTransaction();
        try {
            $leadId = buzzSave($db, $fields, $requestId);
            $bucket['count']++;
            $state['ips'][$ipKey] = $bucket;
            $state['total']++;
            $serialized = $prefix . json_encode($state, JSON_THROW_ON_ERROR);
            rewind($handle);
            if (!ftruncate($handle,0) || fwrite($handle,$serialized) !== strlen($serialized) || !fflush($handle)) throw new RuntimeException('Cannot persist limiter');
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    buzzAfterReply($db, $leadId);
    buzzReply(200, ['ok'=>true]);
} catch (InvalidArgumentException $e) {
    buzzReply(422, ['ok'=>false, 'message'=>$e->getMessage()]);
} catch (JsonException $e) {
    buzzReply(400, ['ok'=>false, 'message'=>'Richiesta non valida.']);
} catch (Throwable $e) {
    // Do not put submitted content or database credentials in public responses/logs.
    error_log('BUZZ contact: ' . get_class($e));
    buzzReply(503, ['ok'=>false, 'message'=>'Non riusciamo a registrare la richiesta. Riprova tra poco.']);
}
