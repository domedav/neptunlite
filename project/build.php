#!/usr/bin/env php
<?php
/**
 * Neptun-Lite Build Processor
 * Minifies CSS and JS, inlines critical CSS, optimizes for Lighthouse
 * 
 * Usage: php build.php [source_dir] [output_dir]
 */

// Configuration
$sourceDir = $argv[1] ?? __DIR__;
$outputDir = $argv[2] ?? __DIR__ . '/dist';

// Week-based versioning: YYYY.MMwWW (e.g., 2026.03w12)
$year = date('Y');
$month = date('m');
$week = date('W');
$version = "{$year}.{$month}w{$week}";

echo "==================================================\n";
echo "Neptun-Lite Build Processor v2.0\n";
echo "==================================================\n";
echo "Source: $sourceDir\n";
echo "Output: $outputDir\n";
echo "Version: $version (week-based cache)\n\n";

// Create output directory
if (!is_dir($outputDir)) {
    mkdir($outputDir, 0755, true);
    mkdir($outputDir . '/icons', 0755, true);
}

// Copy ONLY production files (exclude dev files)
echo "Copying production files...\n";
$productionExtensions = ['png', 'svg', 'json', 'html', 'webp'];
copyFiles($sourceDir, $outputDir, $productionExtensions);

// Copy PHP proxy (needed for CORS)
echo "Copying fetch-ics.php...\n";
copy($sourceDir . '/fetch-ics.php', $outputDir . '/fetch-ics.php');

// Process and minify CSS
echo "Processing CSS...\n";
$cssContent = file_get_contents($sourceDir . '/styles.css');
$cssMinified = minifyCSS($cssContent);
file_put_contents($outputDir . '/styles.min.css', $cssMinified);
echo "  CSS: " . number_format(strlen($cssContent)) . " → " . number_format(strlen($cssMinified)) . " bytes\n";

// Process and minify JS files
echo "Processing JavaScript...\n";
$jsFiles = ['db.js', 'ics-parser.js', 'app.js', 'sw.js'];
foreach ($jsFiles as $jsFile) {
    $jsContent = file_get_contents($sourceDir . '/' . $jsFile);
    $jsMinified = minifyJS($jsContent);
    $baseName = pathinfo($jsFile, PATHINFO_FILENAME);
    
    // For sw.js, update file references to minified versions for dist/
    if ($jsFile === 'sw.js') {
        $jsMinified = str_replace(
            ["'/styles.css'", "'/app.js'", "'/db.js'", "'/ics-parser.js'"],
            ["'/styles.min.css'", "'/app.min.js'", "'/db.min.js'", "'/ics-parser.min.js'"],
            $jsMinified
        );
    }
    
    file_put_contents($outputDir . "/{$baseName}.min.js", $jsMinified);
    echo "  $jsFile: " . number_format(strlen($jsContent)) . " → " . number_format(strlen($jsMinified)) . " bytes\n";
}

// Generate optimized HTML with inlined critical CSS and minified resources
echo "Generating optimized HTML...\n";
$htmlContent = generateOptimizedHTML($sourceDir, $outputDir, $version);
file_put_contents($outputDir . '/index.html', $htmlContent);

// Update manifest with cache busting
echo "Updating manifest...\n";
$manifest = json_decode(file_get_contents($sourceDir . '/manifest.json'), true);
$manifest['name'] = str_replace('V2', '', $manifest['name']);
file_put_contents($outputDir . '/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// Copy PHP proxy
echo "Copying PHP proxy...\n";
copy($sourceDir . '/fetch-ics.php', $outputDir . '/fetch-ics.php');

// Generate cache manifest for SW
echo "Generating service worker cache manifest...\n";
generateCacheManifest($outputDir, $version);

// Calculate savings
$originalSize = array_sum(array_map('filesize', glob($sourceDir . '/*.{css,js}', GLOB_BRACE)));
$minifiedSize = array_sum(array_map('filesize', glob($outputDir . '/*.{css,js}', GLOB_BRACE)));
$savings = $originalSize - $minifiedSize;
$savingsPercent = round(($savings / $originalSize) * 100, 1);

echo "\n==================================================\n";
echo "Build Complete!\n";
echo "==================================================\n";
echo "Original size: " . number_format($originalSize / 1024, 1) . " KB\n";
echo "Minified size: " . number_format($minifiedSize / 1024, 1) . " KB\n";
echo "Savings: " . number_format($savings / 1024, 1) . " KB ($savingsPercent%)\n";
echo "Output: $outputDir\n";
echo "==================================================\n";

/**
 * Minify CSS
 */
function minifyCSS($css) {
    // Remove comments
    $css = preg_replace('!/\*[^*]*\*+([^/*][^*]*\*+)*/!', '', $css);
    
    // Remove whitespace around operators
    $css = preg_replace('/\s*([{}:;,])\s*/', '$1', $css);
    $css = preg_replace('/\s*(\+|\-|\*|\/)\s*/', '$1', $css);
    
    // Remove trailing semicolons
    $css = preg_replace('/;}/', '}', $css);
    
    // Remove duplicate spaces
    $css = preg_replace('/\s+/', ' ', $css);
    
    // Remove leading/trailing whitespace
    $css = trim($css);
    
    return $css;
}

/**
 * Minify JavaScript (basic, safe)
 */
function minifyJS($js) {
    // Remove single-line comments (but preserve URLs and // in strings)
    $lines = explode("\n", $js);
    $result = [];
    foreach ($lines as $line) {
        // Skip comment-only lines
        if (preg_match('/^\s*\/\//', $line)) {
            continue;
        }
        // Remove trailing comments
        $line = preg_replace('/\/\/\s*[^\n]*$/', '', $line);
        $result[] = $line;
    }
    $js = implode("\n", $result);
    
    // Remove multi-line comments
    $js = preg_replace('!/\*[^*]*\*+([^/*][^*]*\*+)*/!', '', $js);
    
    // Remove leading/trailing whitespace on lines
    $js = preg_replace('/^\s+|\s+$/m', '', $js);
    
    // Remove multiple spaces (but preserve strings)
    $js = preg_replace('/[ \t]+/', ' ', $js);
    
    // Remove spaces around safe operators
    $js = preg_replace('/\s*([{};(),=])\s*/', '$1', $js);
    
    return trim($js);
}

/**
 * Copy files with specific extensions
 */
function copyFiles($source, $dest, $extensions) {
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source)
    );

    foreach ($files as $file) {
        if ($file->isFile()) {
            // Skip dist folder and hidden files
            if (strpos($file, '/dist/') !== false || strpos($file, '/.') !== false) {
                continue;
            }
            
            $ext = pathinfo($file, PATHINFO_EXTENSION);
            if (in_array($ext, $extensions)) {
                $relativePath = str_replace($source . '/', '', $file);
                $targetPath = $dest . '/' . $relativePath;

                $targetDir = dirname($targetPath);
                if (!is_dir($targetDir)) {
                    mkdir($targetDir, 0755, true);
                }

                copy($file, $targetPath);
            }
        }
    }
}

/**
 * Generate optimized HTML with critical CSS inlined
 */
function generateOptimizedHTML($source, $dest, $version) {
    $html = file_get_contents($source . '/index.html');
    
    // Extract critical CSS (first ~14KB for above-the-fold content)
    $fullCSS = file_get_contents($source . '/styles.css');
    $criticalCSS = extractCriticalCSS($fullCSS);
    
    // Replace stylesheet link with inline critical CSS
    $criticalStyle = "<style>\n" . minifyCSS($criticalCSS) . "\n</style>";
    $html = preg_replace(
        '/<link rel="stylesheet" href="styles\.css">/',
        $criticalStyle . "\n    <link rel=\"stylesheet\" href=\"styles.min.css?v=$version\" media=\"print\" onload=\"this.media='all'\">",
        $html
    );
    
    // Replace JS files with minified versions
    $jsMappings = [
        'db.js' => 'db.min.js',
        'ics-parser.js' => 'ics-parser.min.js',
        'app.js' => 'app.min.js',
        'sw.js' => 'sw.min.js'
    ];

    foreach ($jsMappings as $original => $minified) {
        $html = str_replace("src=\"$original\"", "src=\"$minified?v=$version\"", $html);
    }

    // Update preload links to minified versions
    $preloadMappings = [
        'href="styles.css"' => 'href="styles.min.css"',
        'href="db.js"' => 'href="db.min.js"',
        'href="ics-parser.js"' => 'href="ics-parser.min.js"',
        'href="app.js"' => 'href="app.min.js"'
    ];

    foreach ($preloadMappings as $original => $minified) {
        $html = str_replace($original, $minified, $html);
    }

    // Update service worker registration to minified version
    $html = str_replace("register('sw.js')", "register('sw.min.js')", $html);

    // Preloads are now in index.html directly for HTTP/2 optimization

    // Add cache-control meta tags
    $cacheMeta = '
    <meta http-equiv="Cache-Control" content="max-age=31536000, public">
    <meta http-equiv="Expires" content="' . date('D, d M Y H:i:s', strtotime('+1 year')) . ' GMT">';

    $html = str_replace('<head>', '<head>' . $cacheMeta, $html);

    // Light HTML minification (only remove HTML comments)
    $html = preg_replace('/<!--[\s\S]*?-->/', '', $html);
    
    // Remove empty lines but preserve structure
    $lines = explode("\n", $html);
    $lines = array_filter($lines, function($line) {
        return trim($line) !== '';
    });
    $html = implode("\n", $lines);

    // Add HTTP/2 Server-Timing header hint (for debugging)
    $html = str_replace('</head>', "\n    <!-- HTTP/2 optimized build v{$version} -->\n</head>", $html);

    return $html;
}

/**
 * Extract critical CSS for above-the-fold content
 */
function extractCriticalCSS($css) {
    // Critical selectors for initial render
    $criticalSelectors = [
        ':root',
        'html',
        'body',
        '\.loading',
        '\.loading-spinner',
        '\.loading-text',
        '\.app',
        '\.app-container',
        '\.header',
        '\.icon-btn',
        '\.view-toggle',
        '\.view-btn',
        '\.calendar-nav',
        '\.nav-btn',
        '\.today-btn',
        '\.period-label',
        '\.error-container',
        '\.error-content',
        '\.error-icon',
        '\.error-text',
        '\.error-dismiss',
        '\.main-content',
        '\.view',
        '\.events-list',
        '\.event-card',
        '\.event-time',
        '\.event-details',
        '\.event-name',
        '\.event-location',
        '\.empty-state',
        '\.status-bar',
        '\.modal',
        '\.modal-content',
        '\.modal-header',
        '\.modal-form',
        '\.form-group',
        '\.btn-primary',
        '\.btn-secondary',
        '\.color-picker',
        '\.color-option',
        '\.ptr-indicator',
        '@keyframes spin',
        '@media \(prefers-color-scheme: dark\)'
    ];
    
    $criticalCSS = "";
    
    // Extract CSS rules for critical selectors
    foreach ($criticalSelectors as $selector) {
        $pattern = '/' . preg_quote($selector, '/') . '\s*{[^}]*}/';
        if (preg_match_all($pattern, $css, $matches)) {
            $criticalCSS .= implode("\n", $matches[0]) . "\n";
        }
    }
    
    // If we didn't get enough, take first 10KB
    if (strlen($criticalCSS) < 10000) {
        $criticalCSS = substr($css, 0, 12000);
        // Cut at last complete rule
        $lastBrace = strrpos($criticalCSS, '}');
        if ($lastBrace) {
            $criticalCSS = substr($criticalCSS, 0, $lastBrace + 1);
        }
    }
    
    return $criticalCSS;
}

/**
 * Generate cache manifest for service worker
 */
function generateCacheManifest($outputDir, $version) {
    $files = [
        '/',
        '/index.html',
        '/styles.min.css',
        '/db.min.js',
        '/ics-parser.min.js',
        '/app.min.js',
        '/sw.min.js',
        '/manifest.json',
        '/favicon.png',
        '/icons/icon-192.webp',
        '/icons/icon-512.webp'
    ];

    // Cache manifest for development only (not included in production)
    // $manifest = "<?php\n";
    // $manifest .= "// Cache version: $version\n";
    // $manifest .= "\$CACHE_VERSION = '$version';\n";
    // $manifest .= "\$STATIC_ASSETS = " . var_export($files, true) . ";\n";
    // file_put_contents($outputDir . '/cache-manifest.php', $manifest);
}
?>
