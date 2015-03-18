call node %~dp0bin\gecko.js %*
echo > "%~dp0build\Chromeless API Demo\.purgecaches"
call "%~dp0build\Chromeless API Demo\Chromeless API Demo.exe" -console -jsconsole -purgecaches
pause