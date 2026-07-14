from pythermalcomfort.models import utci
r = utci(tdb=28, tr=38, v=1.5, rh=65)
print('UTCI test result:', r)
if hasattr(r, 'utci'):
    print('utci attr:', r.utci)
elif isinstance(r, dict):
    print('dict utci:', r.get('utci'))
else:
    print('scalar:', float(r))
