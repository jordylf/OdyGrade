OdyGrade for After Effects / Premiere Pro 2024 (Windows x64)

Install
  1. Close After Effects and Premiere Pro.
  2. Double-click Install.cmd. Approve the one Windows (UAC) prompt: it copies the effect into
     C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore\OdyWorks.
  3. Start the host. Panel: Window > Extensions > OdyGrade. Effect: OdyWorks > OdyGrade.

The panel is unsigned, so the installer enables Adobe CEP debug mode for your user
(HKCU\Software\Adobe\CSXS.11 PlayerDebugMode=1). An existing panel is moved to
%LOCALAPPDATA%\OdyGrade\backup; a replaced effect is kept next to InstallPlugin.ps1.

Uninstall: close both hosts, double-click Uninstall.cmd.

Source profile for iPhone HDR (HLG) video: HLG / Rec.2020 in After Effects (default project),
sRGB in Premiere Pro (it tone-maps HLG to Rec.709 by default).
