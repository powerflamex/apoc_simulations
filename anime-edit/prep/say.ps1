# Speak a word with a built-in Windows voice into a .wav (offline).
#   powershell -File prep/say.ps1 <voice name part> <rate -10..10> <out.wav> <ssml or text>
param([string]$voice, [int]$rate, [string]$out, [string]$text)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like "*$voice*" } | Select-Object -First 1
$s.SelectVoice($v.VoiceInfo.Name)
$s.Rate = $rate
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($out, $fmt)
if ($text.StartsWith('<')) { $s.SpeakSsml($text) } else { $s.Speak($text) }
$s.Dispose()
