#!/usr/bin/env php
<?php
/**
 * Neptun-Lite HTTP/2 Development Server
 * Uses PHP built-in server (HTTP/1.1) with HTTP/2 optimization hints
 * 
 * NOTE: PHP's built-in server only supports HTTP/1.1
 * For HTTP/2 testing, use a proper web server (see HTTP2_SERVER.md)
 */

$host = '127.0.0.1';
$port = 9000;

echo "==================================================\n";
echo "Neptun-Lite V2 - Development Server\n";
echo "==================================================\n";
echo "⚠️  WARNING: PHP built-in server is HTTP/1.1 only!\n";
echo "   For HTTP/2 testing, see HTTP2_SERVER.md\n";
echo "==================================================\n";
echo "Server: http://{$host}:{$port}\n";
echo "==================================================\n\n";

// Start PHP built-in server
exec("php -S {$host}:{$port}");
?>
