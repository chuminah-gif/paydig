$root = "C:\Users\chumina\pension-calculator"
$port = 8123
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Host "Serving $root on http://127.0.0.1:$port/ (Cloudflare Pages style URLs)"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".xml"  = "application/xml"
  ".txt"  = "text/plain"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
  ".svg"  = "image/svg+xml"
  ".json" = "application/json"
}

function Send-File($res, $filePath, $status) {
  $ext = [System.IO.Path]::GetExtension($filePath)
  $contentType = $mime[$ext]
  if (-not $contentType) { $contentType = "application/octet-stream" }
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  $res.StatusCode = $status
  $res.ContentType = $contentType
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Redirect($res, $location) {
  $res.StatusCode = 308
  $res.RedirectLocation = $location
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  try {
    $path = $req.Url.AbsolutePath
    $query = $req.Url.Query
    $rel = $path.TrimStart("/") -replace "/", "\"

    # Cloudflare Pages: /x.html -> /x, /dir/index.html -> /dir/, /index.html -> /
    if ($path -match '/index\.html$') {
      Send-Redirect $res ($path.Substring(0, $path.Length - 10) + $query)
    } elseif ($path -match '\.html$' -and $path -ne '/404.html') {
      Send-Redirect $res ($path.Substring(0, $path.Length - 5) + $query)
    } else {
      $filePath = Join-Path $root $rel
      if ($path -eq "/" -or $path.EndsWith("/")) {
        $idx = Join-Path $filePath "index.html"
        if (Test-Path $idx -PathType Leaf) { Send-File $res $idx 200 } else { $filePath = $null }
      } elseif (Test-Path $filePath -PathType Leaf) {
        Send-File $res $filePath 200
      } elseif (Test-Path ($filePath + ".html") -PathType Leaf) {
        Send-File $res ($filePath + ".html") 200
      } elseif ((Test-Path $filePath -PathType Container) -and (Test-Path (Join-Path $filePath "index.html") -PathType Leaf)) {
        Send-Redirect $res ($path + "/" + $query)
      } else {
        $filePath = $null
      }
      if ($null -eq $filePath) {
        $nf = Join-Path $root "404.html"
        if (Test-Path $nf -PathType Leaf) { Send-File $res $nf 404 } else { $res.StatusCode = 404 }
      }
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
