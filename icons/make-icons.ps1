# Draws the Sortie app icons: a climb chevron over a horizon line.
# Re-run this if the mark ever changes. Requires nothing but Windows PowerShell.
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-SortieIcon {
    param([int]$Size, [string]$Path, [double]$Content = 0.64)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # background: deep navy, lighter toward the top
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $top = [System.Drawing.Color]::FromArgb(255, 16, 26, 43)
    $bot = [System.Drawing.Color]::FromArgb(255, 7, 10, 16)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $top, $bot, 90.0)
    $g.FillRectangle($bg, $rect)

    $teal = [System.Drawing.Color]::FromArgb(255, 53, 214, 187)
    $tealDim = [System.Drawing.Color]::FromArgb(115, 53, 214, 187)

    $k = $Size / 512.0 * ($Content / 0.64)
    $cx = $Size / 2.0
    $cy = $Size / 2.0

    # horizon
    $penH = New-Object System.Drawing.Pen($tealDim, [single](14 * $k))
    $penH.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penH.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $hy = $cy + 66 * $k
    $g.DrawLine($penH, [single]($cx - 150 * $k), [single]$hy, [single]($cx + 150 * $k), [single]$hy)

    # climb chevron
    $penC = New-Object System.Drawing.Pen($teal, [single](30 * $k))
    $penC.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penC.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penC.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pts = @(
        (New-Object System.Drawing.PointF([single]($cx - 96 * $k), [single]($cy + 12 * $k))),
        (New-Object System.Drawing.PointF([single]$cx,             [single]($cy - 70 * $k))),
        (New-Object System.Drawing.PointF([single]($cx + 96 * $k), [single]($cy + 12 * $k)))
    )
    $g.DrawLines($penC, $pts)

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "wrote $Path"
}

New-SortieIcon -Size 512 -Path (Join-Path $here 'icon-512.png') -Content 0.64
New-SortieIcon -Size 192 -Path (Join-Path $here 'icon-192.png') -Content 0.64
New-SortieIcon -Size 180 -Path (Join-Path $here 'apple-touch-icon.png') -Content 0.64
New-SortieIcon -Size 512 -Path (Join-Path $here 'icon-maskable-512.png') -Content 0.50
