<?php
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
if (!$secure || $host !== 'www.buzzstudio.it') {
    header('Location: https://www.buzzstudio.it/', true, 301);
    exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header("Content-Security-Policy: default-src 'self'; script-src 'self' *.iubenda.com 'unsafe-eval'; style-src 'self' 'unsafe-inline' *.iubenda.com; img-src 'self' data: *.iubenda.com; font-src 'self'; connect-src 'self' *.iubenda.com; frame-src 'self' *.iubenda.com; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
readfile(__DIR__ . '/index.html');
