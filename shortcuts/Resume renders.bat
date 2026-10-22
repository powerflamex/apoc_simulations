@echo off
rem Desktop shortcut for the render gate (render-gate.sh): lets waiting renders start again.
del "%USERPROFILE%\.apoc-render\paused" 2>nul
echo.
echo   Renders are ON again. Anything waiting starts within about 10 seconds.
echo.
timeout /t 5
