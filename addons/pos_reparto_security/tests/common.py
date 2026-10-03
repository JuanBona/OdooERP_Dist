from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

TZ_AR = 'America/Argentina/Buenos_Aires'

# 02:00 UTC del 4/10 = 23:00 del 3/10 en Argentina: el momento en que "hoy" en UTC
# ya es el día siguiente pero en Argentina todavía no. Es la ventana (21 a 24 hs AR)
# en la que un usuario sin tz ve el "hoy" equivocado.
MEDIANOCHE_UTC = datetime(2026, 10, 4, 2, 0, 0)


@contextmanager
def reloj_congelado(ahora_utc=MEDIANOCHE_UTC):
    """Congela el reloj que usa fields.Date.context_today (UTC, naive) en `ahora_utc`."""

    class _Reloj(datetime):
        @classmethod
        def now(cls, tz=None):
            return ahora_utc

    with patch('odoo.orm.fields_temporal.datetime', _Reloj):
        yield
