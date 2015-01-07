REM @echo off
pushd somedir
for /f "delims=" %%f in ('dir /b /a-d-h-s %1') do mongoimport %2 %3 %4 %5 %6 %7 %8 %9 < %1\%%f
popd