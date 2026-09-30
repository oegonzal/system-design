# A pod's settings, read the way the apps read them on this machine: the shell
# that ran `tilt up` first, then the repo's gitignored `.env`, parsed like
# Node's --env-file. Values are handed to Secrets and never printed.

def _dotenv_value(raw):
    """One value the way Node's --env-file reads it: a matched quote pair, or an unquoted value up to a `#`."""
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] in ('"', "'"):
        closing = raw.find(raw[0], 1)
        if closing > 0:
            return raw[1:closing]
    if '#' in raw:
        return raw[:raw.index('#')].strip()
    return raw

def _dotenv(path):
    values = {}
    for line in str(read_file(path, '')).splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if key.startswith('export '):
            key = key[len('export '):].strip()
        values[key] = _dotenv_value(value)
    return values

_ENV_FILE = _dotenv(config.main_dir + '/.env')

def env_value(name):
    """The shell's value, else `.env`'s, else ''."""
    return os.getenv(name, '') or _ENV_FILE.get(name, '')

def env_secret(name, keys):
    """
    A Secret holding each of `keys` that has a value, for a pod's `envFrom`.

    A key with no value is left out rather than set empty, so the pod sees it
    unset, as a process on this machine would. The Secret itself always
    exists, so a pod that reads it never waits on it.
    """
    values = {}
    for key in keys:
        value = env_value(key)
        if value:
            values[key] = value
    return encode_yaml({
        'apiVersion': 'v1',
        'kind': 'Secret',
        'metadata': {'name': name},
        'type': 'Opaque',
        'stringData': values,
    })
