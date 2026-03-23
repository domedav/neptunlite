<?php
/**
 * Neptun-Lite ICS Proxy
 * Fetches ICS data from Neptun servers to bypass CORS restrictions
 * 
 * Usage: fetch-ics.php?url=<encoded-neptun-ics-url>
 * 
 * InfinityFree compatible - no external dependencies
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Enable error logging but don't display errors
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

/**
 * Get and validate the URL parameter
 */
function getUrl() {
    if (!isset($_GET['url']) || empty($_GET['url'])) {
        return null;
    }
    
    $url = filter_var($_GET['url'], FILTER_SANITIZE_URL);
    
    // Validate it's a proper URL
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return null;
    }
    
    // Only allow neptun domains for security
    $allowedDomains = [
        'neptun-ws01.uni-pannon.hu',
        'neptun.unideb.hu',
        'neptun.bme.hu',
        'neptun.elte.hu',
        'neptun.uni-miskolc.hu',
        'neptun.sze.hu',
        'neptun.pe.hu',
        'neptun.ktk.pte.hu',
        'neptunhallgato.uni-mate.hu',
        'neptun.corvinus.hu'
    ];
    
    $parsedUrl = parse_url($url);
    if (!isset($parsedUrl['host']) || !in_array($parsedUrl['host'], $allowedDomains)) {
        return null;
    }
    
    return $url;
}

/**
 * Fetch ICS content from URL using cURL or file_get_contents
 */
function fetchICS($url) {
    // Try cURL first (more reliable)
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Neptun-Lite/2.0 (Calendar Aggregator)');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        
        $content = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            return ['success' => false, 'error' => $error, 'code' => 0];
        }
        
        if ($httpCode !== 200) {
            return ['success' => false, 'error' => "HTTP $httpCode", 'code' => $httpCode];
        }
        
        return ['success' => true, 'content' => $content, 'code' => $httpCode];
    }
    
    // Fallback to file_get_contents (if allow_url_fopen is enabled)
    if (ini_get('allow_url_fopen')) {
        $context = stream_context_create([
            'http' => [
                'timeout' => 30,
                'user_agent' => 'Neptun-Lite/2.0 (Calendar Aggregator)',
                'follow_location' => 1
            ]
        ]);
        
        $content = @file_get_contents($url, false, $context);
        
        if ($content === false) {
            return ['success' => false, 'error' => 'Failed to fetch URL', 'code' => 0];
        }
        
        return ['success' => true, 'content' => $content, 'code' => 200];
    }
    
    return ['success' => false, 'error' => 'No fetch method available (enable cURL or allow_url_fopen)', 'code' => 0];
}

/**
 * Validate ICS content
 */
function validateICS($content) {
    if (empty($content)) {
        return false;
    }
    
    // Check for required ICS markers
    if (strpos($content, 'BEGIN:VCALENDAR') === false) {
        return false;
    }
    
    if (strpos($content, 'END:VCALENDAR') === false) {
        return false;
    }
    
    return true;
}

// Main execution
$url = getUrl();

if (!$url) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Invalid or missing URL parameter',
        'hint' => 'Provide a valid Neptun ICS URL: ?url=<encoded-url>'
    ]);
    exit;
}

// Fetch the ICS data
$result = fetchICS($url);

if (!$result['success']) {
    http_response_code($result['code'] ?: 500);
    echo json_encode([
        'success' => false,
        'error' => $result['error'],
        'url' => substr($url, 0, 100) . '...'
    ]);
    exit;
}

// Validate the content
if (!validateICS($result['content'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Invalid ICS format - missing VCALENDAR markers',
        'url' => substr($url, 0, 100) . '...'
    ]);
    exit;
}

// Success - return the ICS content
echo json_encode([
    'success' => true,
    'content' => $result['content'],
    'length' => strlen($result['content']),
    'url' => substr($url, 0, 100) . '...'
]);
?>
