# Prints one line per face: x y w h as fractions of the image size. Windows 10/11 WinRT FaceDetector.
param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'}|select -First 1
function Await($op,[type]$t){$task=$asTask.MakeGenericMethod($t).Invoke($null,@($op));$task.Wait()|Out-Null;$task.Result}
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
[void][Windows.Media.FaceAnalysis.FaceDetector,Windows.Media.FaceAnalysis,ContentType=WindowsRuntime]
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $Path).Path)) ([Windows.Storage.StorageFile])
$stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try{
 $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 $bitmap=[Windows.Graphics.Imaging.SoftwareBitmap]::Convert((Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])),[Windows.Graphics.Imaging.BitmapPixelFormat]::Gray8)
 $detector=Await ([Windows.Media.FaceAnalysis.FaceDetector]::CreateAsync()) ([Windows.Media.FaceAnalysis.FaceDetector])
 $faces=Await ($detector.DetectFacesAsync($bitmap)) ([System.Collections.Generic.IList[Windows.Media.FaceAnalysis.DetectedFace]])
 $w=[double]$bitmap.PixelWidth;$h=[double]$bitmap.PixelHeight;$inv=[Globalization.CultureInfo]::InvariantCulture
 foreach($f in $faces){$b=$f.FaceBox;[string]::Format($inv,'{0:0.####} {1:0.####} {2:0.####} {3:0.####}',$b.X/$w,$b.Y/$h,$b.Width/$w,$b.Height/$h)}
}finally{$stream.Dispose()}
