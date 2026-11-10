@echo off
rem Desktop shortcut for the render gate (render-gate.sh): new renders wait until "Resume renders" is clicked.
mkdir "%USERPROFILE%\.apoc-render" 2>nul
echo paused> "%USERPROFILE%\.apoc-render\paused"
echo.
echo   Renders are PAUSED. New renders wait until you double-click "Resume renders".
set L=
if exist "%USERPROFILE%\.apoc-render\lock\label" set /p L=<"%USERPROFILE%\.apoc-render\lock\label"
if defined L echo   (%L% is rendering right now: it finishes first, then the rest wait.)
echo.
timeout /t 8
