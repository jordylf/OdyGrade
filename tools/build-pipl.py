"""Build Windows PiPL resources with the user's actual Adobe SDK tool."""
from pathlib import Path
import subprocess,sys
compiler,sdk,source,output=sys.argv[1:]
sdk=Path(sdk);out=Path(output);out.parent.mkdir(parents=True,exist_ok=True)
rr=out.with_suffix('.rr');rrc=out.with_suffix('.rrc')
def preprocess(file,defines=()):
 return subprocess.check_output([compiler,'/nologo','/EP','/TC','/I'+str(sdk/'Examples/Headers'),*defines,str(file)])
rr.write_bytes(preprocess(source))
subprocess.run([str(sdk/'Examples/Resources/PiPLtool.exe'),str(rr),str(rrc)],check=True)
out.write_bytes(preprocess(rrc,('/DMSWindows',)))
print('Generated native PiPL:',out)
