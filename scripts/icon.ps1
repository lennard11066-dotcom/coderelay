Add-Type -AssemblyName System.Drawing
$images = @()
foreach ($size in @(16,32,48,64,128,256)) {
    $bitmap = [Drawing.Bitmap]::new($size,$size)
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = 'AntiAlias'
    $g.ScaleTransform($size/64,$size/64)
    $g.Clear([Drawing.ColorTranslator]::FromHtml('#191925'))
    foreach ($line in @(@('#87a6ff',23,16,8,32,23,48),@('#b49bff',41,16,56,32,41,48),@('#f2efff',26,37,38,27))) {
        $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml($line[0]),7)
        $pen.StartCap = 'Round'
        $pen.EndCap = 'Round'
        for($i=1;$i -lt $line.Count-2;$i+=2){$g.DrawLine($pen,$line[$i],$line[$i+1],$line[$i+2],$line[$i+3])}
        $pen.Dispose()
    }
    $memory = [IO.MemoryStream]::new()
    $bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png)
    $images += ,$memory.ToArray()
    $g.Dispose()
    $bitmap.Dispose()
    $memory.Dispose()
}
$writer = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $PSScriptRoot '../assets/icon.ico')))
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)
    $offset = 6+16*$images.Count
    $sizes = @(16,32,48,64,128,0)
    for($i=0;$i -lt $images.Count;$i++){
        $writer.Write([byte]$sizes[$i]);$writer.Write([byte]$sizes[$i]);$writer.Write([uint16]0)
        $writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([int]$images[$i].Length);$writer.Write([int]$offset)
        $offset += $images[$i].Length
    }
    foreach($png in $images){$writer.Write([byte[]]$png)}
} finally {$writer.Dispose()}
