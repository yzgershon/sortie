# Builds the blurred cockpit backdrop from the source photo.
#
# The source is 768x1344 (0.57) and a phone viewport is nearer 0.46, so a plain
# `cover` would crop the outer instrument panels away. Instead the photo is fit
# to the WIDTH on a taller canvas, and the gap above and below is filled by
# stretching the photo's own edge rows outward. That is seamless by
# construction, unlike filling with a sampled colour.
#
# The blur is baked in (downscale then upscale) rather than applied with a CSS
# filter, so the phone pays nothing to render it.
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'cockpit-source.jpg'
$out  = Join-Path $here 'cockpit.jpg'

$W = 828
$H = 1792          # 0.462, matches a modern iPhone viewport
$BLUR_DIV = 9      # bigger = softer
$EDGE = 26         # how many source rows get stretched into the gap

$img = [System.Drawing.Image]::FromFile($src)

$scale  = $W / [double]$img.Width
$drawH  = [int][Math]::Round($img.Height * $scale)
$top    = [int][Math]::Round(($H - $drawH) * 0.62)   # bias downward; sky extends up
$bottom = [int]($top + $drawH)

Write-Output ("source {0}x{1}  ->  draw {2}x{3} at y={4}, bottom={5}" -f `
  $img.Width, $img.Height, $W, $drawH, $top, $bottom)

# --- 1. compose at full size -------------------------------------------------
$canvas = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$unit = [System.Drawing.GraphicsUnit]::Pixel

# extend upward by stretching the photo's top rows
if ($top -gt 0) {
    $destTop = New-Object System.Drawing.Rectangle(0, 0, $W, ($top + 2))
    $g.DrawImage($img, $destTop, 0, 0, $img.Width, $EDGE, $unit)
}

# extend downward by stretching the photo's bottom rows
if ($bottom -lt $H) {
    $destBot = New-Object System.Drawing.Rectangle(0, ($bottom - 2), $W, ($H - $bottom + 2))
    $g.DrawImage($img, $destBot, 0, ($img.Height - $EDGE), $img.Width, $EDGE, $unit)
}

# the photo itself
$destMain = New-Object System.Drawing.Rectangle(0, $top, $W, $drawH)
$g.DrawImage($img, $destMain, 0, 0, $img.Width, $img.Height, $unit)
$g.Dispose()

# --- 2. bake the blur: shrink hard, then grow back ---------------------------
$sw = [int]($W / $BLUR_DIV)
$sh = [int]($H / $BLUR_DIV)
$small = New-Object System.Drawing.Bitmap($sw, $sh)
$gs = [System.Drawing.Graphics]::FromImage($small)
$gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
$gs.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gs.DrawImage($canvas, 0, 0, $sw, $sh)
$gs.Dispose()

$final = New-Object System.Drawing.Bitmap($W, $H)
$gf = [System.Drawing.Graphics]::FromImage($final)
$gf.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gf.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
# draw a touch oversized so the bicubic edge clamp never shows a border
$gf.DrawImage($small, -3, -3, ($W + 6), ($H + 6))
$gf.Dispose()

# --- 3. save -----------------------------------------------------------------
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
         Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, 74L)
$final.Save($out, $codec, $params)

Write-Output ("wrote {0}  {1}x{2}  {3:N0} bytes" -f $out, $W, $H, (Get-Item $out).Length)

$final.Dispose(); $canvas.Dispose(); $small.Dispose(); $img.Dispose()
