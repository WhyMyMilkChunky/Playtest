@echo off
setlocal
pushd "%~dp0"
"%~dp0LIFE-LIVE.exe" --opengl
set "result=%errorlevel%"
if not "%result%"=="0" (
    echo.
    echo LIFE-LIVE exited with error %result%.
    pause
)
popd
exit /b %result%