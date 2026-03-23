#!/usr/bin/env python3
"""
Neptun-Lite Icon Generator
Uses imagemagick/inkscape to convert master SVG to all required formats
"""

import os
import subprocess

# Create icons directory if it doesn't exist
os.makedirs('icons', exist_ok=True)
os.makedirs('screenshots', exist_ok=True)

print("=" * 60)
print("Neptun-Lite Icon Generator")
print("=" * 60)

# Master icon SVG - the ONLY source of truth
master_icon = '''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
        <linearGradient id="grad512" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
    </defs>
    
    <!-- Background rounded square -->
    <rect x="24" y="24" width="464" height="464" rx="80" fill="url(#grad512)"/>
    
    <!-- Calendar grid background -->
    <rect x="64" y="100" width="384" height="320" rx="24" fill="white" opacity="0.15"/>
    
    <!-- Calendar header -->
    <rect x="64" y="100" width="384" height="80" rx="24" fill="white" opacity="0.25"/>
    <rect x="64" y="140" width="384" height="40" fill="none"/>
    
    <!-- Calendar day squares -->
    <rect x="80" y="200" width="100" height="100" rx="16" fill="white" opacity="0.9"/>
    <rect x="206" y="200" width="100" height="100" rx="16" fill="white" opacity="0.7"/>
    <rect x="332" y="200" width="100" height="100" rx="16" fill="white" opacity="0.5"/>
    
    <rect x="80" y="320" width="100" height="100" rx="16" fill="white" opacity="0.6"/>
    <rect x="206" y="320" width="100" height="100" rx="16" fill="white" opacity="0.8"/>
    <rect x="332" y="320" width="100" height="100" rx="16" fill="white" opacity="0.4"/>
    
    <!-- Accent dot on today -->
    <circle cx="130" cy="250" r="20" fill="#6366f1"/>
</svg>'''

print("\n=== Creating Master SVG ===")
with open('icons/icon-512.svg', 'w') as f:
    f.write(master_icon)
print("✓ icons/icon-512.svg created")

# OG Image with Neptun-Lite text (1200x630 for social sharing)
og_image_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
        <linearGradient id="ogGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.3"/>
        </filter>
    </defs>

    <!-- Background gradient -->
    <rect width="1200" height="630" fill="url(#ogGrad)"/>

    <!-- Decorative circles -->
    <circle cx="100" cy="100" r="200" fill="white" opacity="0.05"/>
    <circle cx="1100" cy="530" r="300" fill="white" opacity="0.05"/>

    <!-- Icon (left side, large) -->
    <rect x="80" y="165" width="200" height="200" rx="40" fill="white" opacity="0.2" filter="url(#shadow)"/>
    <rect x="100" y="205" width="160" height="50" rx="12" fill="white" opacity="0.9"/>
    <rect x="100" y="275" width="70" height="70" rx="10" fill="white" opacity="0.7"/>
    <rect x="190" y="275" width="70" height="70" rx="10" fill="white" opacity="0.5"/>
    <circle cx="150" cy="230" r="15" fill="#6366f1"/>

    <!-- Main text: Neptun-Lite -->
    <text x="380" y="280" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="84" font-weight="800" fill="white" letter-spacing="2">Neptun-Lite</text>

    <!-- Subtitle -->
    <text x="380" y="340" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="400" fill="white" opacity="0.9">Egyszerű Neptun naptár</text>

    <!-- Feature badges -->
    <rect x="380" y="380" width="180" height="50" rx="25" fill="white" opacity="0.15"/>
    <text x="470" y="413" font-family="system-ui" font-size="20" font-weight="600" fill="white">Offline</text>

    <rect x="580" y="380" width="180" height="50" rx="25" fill="white" opacity="0.15"/>
    <text x="670" y="413" font-family="system-ui" font-size="20" font-weight="600" fill="white">Értesítések</text>

    <rect x="780" y="380" width="180" height="50" rx="25" fill="white" opacity="0.15"/>
    <text x="870" y="413" font-family="system-ui" font-size="20" font-weight="600" fill="white">PWA</text>

    <!-- Bottom accent -->
    <rect x="0" y="580" width="1200" height="50" fill="white" opacity="0.08"/>
    <text x="600" y="615" font-family="system-ui" font-size="24" font-weight="400" fill="white" opacity="0.7" text-anchor="middle">neptunlite.rf.gd</text>
</svg>'''

with open('screenshots/og-image.svg', 'w') as f:
    f.write(og_image_svg)
print("✓ screenshots/og-image.svg created")

# Shortcut icons
shortcut_today_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
        <linearGradient id="shortcutGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect x="8" y="8" width="80" height="80" rx="20" fill="url(#shortcutGrad1)"/>
    <text x="48" y="62" font-family="system-ui" font-size="40" font-weight="700" fill="white" text-anchor="middle">Ma</text>
</svg>'''

shortcut_url_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
        <linearGradient id="shortcutGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect x="8" y="8" width="80" height="80" rx="20" fill="url(#shortcutGrad2)"/>
    <circle cx="48" cy="48" r="28" fill="none" stroke="white" stroke-width="6"/>
    <path d="M48 34v28M34 48h28" stroke="white" stroke-width="6" stroke-linecap="round"/>
</svg>'''

with open('icons/shortcut-today.svg', 'w') as f:
    f.write(shortcut_today_svg)
print("✓ icons/shortcut-today.svg created")

with open('icons/shortcut-url.svg', 'w') as f:
    f.write(shortcut_url_svg)
print("✓ icons/shortcut-url.svg created")

# Convert SVG to other formats using imagemagick
print("\n=== Converting SVG to WEBP/PNG using imagemagick ===")

def convert_svg_to_webp(svg_file, webp_file, size=None):
    """Convert SVG to WEBP using imagemagick convert"""
    size_arg = f"-resize {size}x{size}!" if size else ""
    try:
        cmd = f"convert -background none {size_arg} '{svg_file}' '{webp_file}' 2>&1"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            return True
        else:
            print(f"  Warning: {result.stderr}")
            return False
    except Exception as e:
        print(f"  Error: {e}")
        return False

# Convert all icons
print("\nConverting icons...")
conversions = [
    ('icons/icon-512.svg', 'icons/icon-512.webp', 512),
    ('icons/icon-512.svg', 'icons/icon-192.webp', 192),
    ('screenshots/og-image.svg', 'screenshots/og-image.webp', None),
    ('icons/shortcut-today.svg', 'icons/shortcut-today.webp', 96),
    ('icons/shortcut-url.svg', 'icons/shortcut-url.webp', 96),
]

for svg, webp, size in conversions:
    if os.path.exists(svg):
        if convert_svg_to_webp(svg, webp, size):
            size_str = f"({size}x{size})" if size else ""
            print(f"✓ {webp} created {size_str}")
        else:
            print(f"✗ {webp} - conversion failed")

print("\n=== Icon Summary ===")
print("\nSVG (master files):")
for f in sorted(os.listdir('icons')):
    if f.endswith('.svg'):
        print(f"  - icons/{f}")
print("  - screenshots/og-image.svg")

print("\nWEBP (for PWA/OG/social):")
for f in sorted(os.listdir('icons')):
    if f.endswith('.webp'):
        print(f"  - icons/{f}")
for f in sorted(os.listdir('screenshots')):
    if f.endswith('.webp'):
        print(f"  - screenshots/{f}")

print("\n✓ Icon generation complete!")
print("\nNote: favicon.png is generated using inkscape:")
print("  inkscape --export-type=png --export-width=32 --export-height=32 --export-filename=favicon.png icons/icon-512.svg")
