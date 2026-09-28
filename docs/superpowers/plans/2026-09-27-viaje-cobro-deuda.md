# Viajes: Cobro de Deuda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the `pos_reparto_viaje` "Viaje" screen, show each parada's outstanding debt and let the chofer collect it (registering a real `account.payment`, capped at the current debt, with a double-confirmation step) without leaving the Viaje screen or opening the full POS.

**Architecture:** Backend: `reparto.viaje.get_mi_viaje_hoy()` gains a `deuda_monto` per parada (reads `res.partner.credito_monto_adeudado`, a field added by `pos_reparto_credito`); `reparto.viaje.parada` gains `action_cobrar_deuda(monto, medio)`, a `.sudo()`-gated method that validates ownership (chofer must own the parada) and amount (`0 < monto <= deuda actual`), creates and posts a plain `account.payment` on the `cash`/`bank` journal matching `medio`, and marks the parada visited. Everything downstream (debt reconciliation, commission line, Caja classification) already exists as hooks on `account.payment`/`pos.reparto.comision.linea` from earlier phases — this task does not duplicate any of that. Frontend: `viaje_screen.js`/`.xml`/`.scss` add a tappable debt badge per parada, an inline amount+method panel, and a `ConfirmationDialog` safety step before the RPC fires.

**Tech Stack:** Odoo 19 CE, Python, OWL (JS), `TransactionCase` tests. New dependencies for `pos_reparto_viaje`: `account`, `pos_reparto_credito`.

**Reference spec:** `docs/superpowers/specs/2026-09-27-viaje-cobro-deuda-design.md`

---

## Before you start

Run all `docker compose` commands from this repo's root directory (`C:\Users\Bonan\Desktop\OdooERP_Dist`) — `docker-compose.yml` uses a relative bind mount (`./addons`), so running from anywhere else silently serves a different `addons/` folder with no error.

To run tests for `pos_reparto_viaje` after any change in this plan:

```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_viaje --test-enable --stop-after-init --log-level=test
```

This module now depends on `pos_reparto_credito` (Task 1 adds it to the manifest) — the `-u` command above will pull it in automatically since it's an existing installed dependency; no need to list it explicitly.

There is **no frontend JS test infrastructure anywhere in this repo** (confirmed: no `*.test.js`, no tours). Task 2 (frontend) is implemented directly without TDD, per established project convention — verified manually in Task 3 instead.

---

### Task 1: Backend — `deuda_monto` + `action_cobrar_deuda`

**Files:**
- Modify: `addons/pos_reparto_viaje/models/reparto_viaje.py`
- Modify: `addons/pos_reparto_viaje/__manifest__.py`
- Modify: `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`

- [ ] **Step 1: Write the failing tests**

Add this import to the top of `addons/pos_reparto_viaje/tests/test_reparto_viaje.py` (keep the existing `from odoo import fields` and `from odoo.tests.common import TransactionCase, tagged` lines as-is, just add this one):

```python
from odoo import Command
```

Add these lines inside `setUpClass`, right after the existing `cls.cliente_b = ...` line (keep everything else in `setUpClass` unchanged):

```python
        cls.receivable_account = cls.env['account.account'].search([
            ('account_type', '=', 'asset_receivable'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.income_account = cls.env['account.account'].search([
            ('account_type', '=', 'income'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.cliente_a.property_account_receivable_id = cls.receivable_account.id
        cls.cliente_b.property_account_receivable_id = cls.receivable_account.id
```

Add this helper method right after `_crear_viaje` (same class, same indentation level):

```python
    def _crear_linea_por_cobrar(self, partner, monto, fecha):
        move = self.env['account.move'].create({
            'move_type': 'entry',
            'date': fecha,
            'line_ids': [
                Command.create({
                    'account_id': self.receivable_account.id,
                    'partner_id': partner.id,
                    'debit': monto,
                    'credit': 0.0,
                    'name': 'Pedido a credito de prueba',
                }),
                Command.create({
                    'account_id': self.income_account.id,
                    'debit': 0.0,
                    'credit': monto,
                    'name': 'Contrapartida de prueba',
                }),
            ],
        })
        move.action_post()
        return move.line_ids.filtered(lambda l: l.account_id == self.receivable_account)
```

Add these test methods at the end of the `TestRepartoViaje` class:

```python
    def test_get_mi_viaje_hoy_incluye_deuda_por_parada(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, fields.Date.today())
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a, self.cliente_b])

        resultado = self.env['reparto.viaje'].with_user(self.chofer_1).get_mi_viaje_hoy()
        deuda_por_nombre = {p['partner_name']: p['deuda_monto'] for p in resultado['paradas']}
        self.assertEqual(deuda_por_nombre['Cliente Viaje A'], 500.0)
        self.assertEqual(deuda_por_nombre['Cliente Viaje B'], 0.0)

    def test_action_cobrar_deuda_crea_pago_y_reduce_deuda(self):
        self._crear_linea_por_cobrar(self.cliente_a, 1000.0, fields.Date.today())
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]

        nueva_deuda = parada.with_user(self.chofer_1).action_cobrar_deuda(400.0, 'efectivo')

        self.assertEqual(nueva_deuda, 600.0)
        self.assertEqual(self.cliente_a.credito_monto_adeudado, 600.0)

    def test_action_cobrar_deuda_marca_parada_visitada(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, fields.Date.today())
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]

        parada.with_user(self.chofer_1).action_cobrar_deuda(500.0, 'efectivo')

        self.assertTrue(parada.visitado)

    def test_action_cobrar_deuda_usa_diario_segun_medio(self):
        self._crear_linea_por_cobrar(self.cliente_a, 1000.0, fields.Date.today())
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]

        parada.with_user(self.chofer_1).action_cobrar_deuda(300.0, 'transferencia')

        pago = self.env['account.payment'].search([('partner_id', '=', self.cliente_a.id)])
        self.assertEqual(len(pago), 1)
        self.assertEqual(pago.journal_id.type, 'bank')

    def test_action_cobrar_deuda_rechaza_monto_cero(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, fields.Date.today())
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]

        with self.assertRaises(Exception):
            parada.with_user(self.chofer_1).action_cobrar_deuda(0.0, 'efectivo')

    def test_action_cobrar_deuda_rechaza_monto_mayor_a_la_deuda(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, fields.Date.today())
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]

        with self.assertRaises(Exception):
            parada.with_user(self.chofer_1).action_cobrar_deuda(600.0, 'efectivo')

    def test_action_cobrar_deuda_rechaza_parada_de_otro_chofer(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, fields.Date.today())
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]

        with self.assertRaises(Exception):
            parada.with_user(self.chofer_2).action_cobrar_deuda(100.0, 'efectivo')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_viaje --test-enable --stop-after-init --log-level=test
```

Expected: FAIL — `KeyError: 'deuda_monto'` on the first new test (field doesn't exist in the dict yet), and `AttributeError`/`ValueError` on the rest (`action_cobrar_deuda` doesn't exist yet, `credito_monto_adeudado` doesn't exist on `res.partner` yet since `pos_reparto_credito` isn't a dependency yet).

- [ ] **Step 3: Add the manifest dependencies**

Modify `addons/pos_reparto_viaje/__manifest__.py` — change:

```python
    'depends': ['point_of_sale', 'pos_reparto_security'],
```

to:

```python
    'depends': ['point_of_sale', 'pos_reparto_security', 'account', 'pos_reparto_credito'],
```

- [ ] **Step 4: Implement `deuda_monto` and `action_cobrar_deuda`**

Modify `addons/pos_reparto_viaje/models/reparto_viaje.py` — replace the whole file with:

```python
from odoo import api, fields, models
from odoo.exceptions import UserError


class RepartoViaje(models.Model):
    _name = 'reparto.viaje'
    _description = 'Viaje (hoja de ruta diaria de un chofer)'
    _order = 'fecha desc, id desc'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    chofer_id = fields.Many2one(
        'res.users', string='Chofer', required=True,
        domain=lambda self: [('group_ids', 'in', self.env.ref('pos_reparto_security.group_reparto_vendedor').id)],
    )
    pos_config_id = fields.Many2one('pos.config', string='Punto de Venta', required=True)
    parada_ids = fields.One2many('reparto.viaje.parada', 'viaje_id', string='Paradas')

    paradas_totales = fields.Integer(string='Paradas totales', compute='_compute_progreso')
    paradas_completadas = fields.Integer(string='Paradas completadas', compute='_compute_progreso')
    progreso = fields.Float(string='Progreso (%)', compute='_compute_progreso')

    _chofer_fecha_unique = models.Constraint(
        'unique(chofer_id, fecha)',
        'Este chofer ya tiene un viaje asignado para esa fecha.',
    )

    @api.depends('parada_ids.visitado')
    def _compute_progreso(self):
        for viaje in self:
            total = len(viaje.parada_ids)
            completadas = len(viaje.parada_ids.filtered('visitado'))
            viaje.paradas_totales = total
            viaje.paradas_completadas = completadas
            viaje.progreso = (completadas / total * 100) if total else 0.0

    @api.model
    def get_mi_viaje_hoy(self):
        viaje = self.search([
            ('chofer_id', '=', self.env.uid),
            ('fecha', '=', fields.Date.context_today(self)),
        ], limit=1)
        if not viaje:
            return False
        return {
            'id': viaje.id,
            'fecha': fields.Date.to_string(viaje.fecha),
            'paradas': [
                {
                    'id': parada.id,
                    'partner_name': parada.partner_id.name,
                    'visitado': parada.visitado,
                    'deuda_monto': parada.partner_id.credito_monto_adeudado,
                }
                for parada in viaje.parada_ids
            ],
        }


class RepartoViajeParada(models.Model):
    _name = 'reparto.viaje.parada'
    _description = 'Parada de un viaje (cliente a visitar)'

    viaje_id = fields.Many2one('reparto.viaje', string='Viaje', required=True, ondelete='cascade')
    partner_id = fields.Many2one('res.partner', string='Cliente', required=True)
    visitado = fields.Boolean(string='Visitado', default=False)
    pedido_id = fields.Many2one('pos.order', string='Pedido', readonly=True)

    def action_abrir_pos(self):
        self.ensure_one()
        action = self.viaje_id.pos_config_id.open_ui()
        separator = '&' if '?' in action['url'] else '?'
        action['url'] += f'{separator}reparto_partner_id={self.partner_id.id}'
        return action

    def action_cobrar_deuda(self, monto, medio):
        self.ensure_one()
        if self.viaje_id.chofer_id.id != self.env.uid:
            raise UserError('No podés cobrar una parada que no es tuya.')
        if medio not in ('efectivo', 'transferencia'):
            raise UserError('Medio de pago inválido.')
        partner = self.partner_id
        deuda = partner.credito_monto_adeudado
        if monto <= 0:
            raise UserError('El monto tiene que ser mayor a cero.')
        if monto > deuda:
            raise UserError(f'El monto no puede ser mayor a la deuda actual (${deuda:.2f}).')
        journal_type = 'cash' if medio == 'efectivo' else 'bank'
        journal = self.env['account.journal'].search([('type', '=', journal_type)], limit=1)
        if not journal:
            raise UserError('No hay un diario configurado para ese medio de pago.')
        payment = self.env['account.payment'].sudo().create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'journal_id': journal.id,
        })
        payment.action_post()
        self.write({'visitado': True})
        return partner.credito_monto_adeudado
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_viaje --test-enable --stop-after-init --log-level=test
```

Expected: PASS — all 7 new tests plus the existing `pos_reparto_viaje` suite green.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_viaje/models/reparto_viaje.py addons/pos_reparto_viaje/__manifest__.py addons/pos_reparto_viaje/tests/test_reparto_viaje.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_viaje): cobrar deuda del cliente desde la parada

reparto.viaje.parada.action_cobrar_deuda crea y postea un
account.payment (topeado a la deuda actual, diario segun medio
efectivo/transferencia) y marca la parada visitada. Reusa los hooks
existentes de conciliacion/comision/caja sin duplicar logica.
Fase 4 del roadmap (RF-V05).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CUSzypLbLZd7AziSFz4Lk3
EOF
)"
```

---

### Task 2: Frontend — mostrar deuda y cobrar en `viaje_screen`

**Files:**
- Modify: `addons/pos_reparto_viaje/static/src/viaje_screen.js`
- Modify: `addons/pos_reparto_viaje/static/src/viaje_screen.xml`
- Modify: `addons/pos_reparto_viaje/static/src/viaje_screen.scss`

No automated tests for this task (no JS test infrastructure exists in this repo). Implemented directly; verified manually in Task 3.

- [ ] **Step 1: Rewrite `viaje_screen.js`**

Replace the whole file `addons/pos_reparto_viaje/static/src/viaje_screen.js` with:

```javascript
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

export class RepartoViajeScreen extends Component {
    static template = "pos_reparto_viaje.ViajeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.state = useState({ viaje: false, loading: true, error: false, cobro: false });
        onWillStart(async () => {
            try {
                this.state.viaje = await this.orm.call("reparto.viaje", "get_mi_viaje_hoy", []);
            } catch {
                this.state.error = true;
            }
            this.state.loading = false;
        });
    }

    async onParadaClick(parada) {
        if (parada.visitado) {
            return;
        }
        const action = await this.orm.call("reparto.viaje.parada", "action_abrir_pos", [parada.id]);
        this.actionService.doAction(action);
    }

    onDeudaClick(parada, ev) {
        ev.stopPropagation();
        this.state.cobro = {
            paradaId: parada.id,
            partnerName: parada.partner_name,
            monto: parada.deuda_monto,
            medio: "efectivo",
        };
    }

    cancelarCobro() {
        this.state.cobro = false;
    }

    confirmarCobro() {
        const cobro = this.state.cobro;
        this.dialog.add(ConfirmationDialog, {
            title: _t("Confirmar cobro"),
            body: _t(
                "¿Confirmás cobrar $%s a %s por %s? No se puede deshacer desde acá.",
                Number(cobro.monto).toFixed(2),
                cobro.partnerName,
                cobro.medio
            ),
            confirm: () => this.ejecutarCobro(cobro),
            cancel: () => {},
        });
    }

    async ejecutarCobro(cobro) {
        try {
            const nuevaDeuda = await this.orm.call(
                "reparto.viaje.parada",
                "action_cobrar_deuda",
                [cobro.paradaId, Number(cobro.monto), cobro.medio]
            );
            const parada = this.state.viaje.paradas.find((p) => p.id === cobro.paradaId);
            parada.deuda_monto = nuevaDeuda;
            parada.visitado = true;
            this.state.cobro = false;
        } catch (error) {
            this.state.cobro = false;
            this.dialog.add(AlertDialog, {
                title: _t("No se pudo registrar el cobro"),
                body: error.data ? error.data.message : String(error),
            });
        }
    }
}

registry.category("actions").add("pos_reparto_viaje.viaje_screen", RepartoViajeScreen);
```

- [ ] **Step 2: Rewrite `viaje_screen.xml`**

Replace the whole file `addons/pos_reparto_viaje/static/src/viaje_screen.xml` with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<templates xml:space="preserve">

    <t t-name="pos_reparto_viaje.ViajeScreen">
        <div class="o_reparto_viaje">
            <div t-if="state.loading" class="o_reparto_viaje_loading">
                Cargando...
            </div>
            <div t-elif="state.error" class="o_reparto_viaje_empty">
                No se pudo cargar el viaje. Probá recargar la página.
            </div>
            <div t-elif="!state.viaje" class="o_reparto_viaje_empty">
                No tenés viaje asignado hoy.
            </div>
            <div t-else="" class="o_reparto_viaje_grid">
                <div t-foreach="state.viaje.paradas" t-as="parada" t-key="parada.id"
                     t-attf-class="o_reparto_viaje_parada {{ parada.visitado ? 'o_reparto_viaje_parada_visitada' : '' }}"
                     t-on-click="() => this.onParadaClick(parada)">
                    <div class="o_reparto_viaje_parada_info">
                        <span t-out="parada.partner_name"/>
                        <span t-if="parada.deuda_monto > 0"
                              class="o_reparto_viaje_deuda"
                              t-on-click="(ev) => this.onDeudaClick(parada, ev)">
                            Debe $<t t-out="parada.deuda_monto.toFixed(2)"/>
                        </span>
                    </div>
                    <span t-if="parada.visitado" class="o_reparto_viaje_check">✓</span>
                </div>
            </div>
            <div t-if="state.cobro" class="o_reparto_viaje_cobro_overlay" t-on-click="cancelarCobro">
                <div class="o_reparto_viaje_cobro_panel" t-on-click="(ev) => ev.stopPropagation()">
                    <h3>Cobrar a <t t-out="state.cobro.partnerName"/></h3>
                    <input type="number" step="0.01" min="0" t-model.number="state.cobro.monto"/>
                    <div class="o_reparto_viaje_cobro_medios">
                        <button t-attf-class="o_reparto_viaje_medio_btn {{ state.cobro.medio === 'efectivo' ? 'active' : '' }}"
                                t-on-click="() => state.cobro.medio = 'efectivo'">Efectivo</button>
                        <button t-attf-class="o_reparto_viaje_medio_btn {{ state.cobro.medio === 'transferencia' ? 'active' : '' }}"
                                t-on-click="() => state.cobro.medio = 'transferencia'">Transferencia</button>
                    </div>
                    <div class="o_reparto_viaje_cobro_botones">
                        <button t-on-click="cancelarCobro">Cancelar</button>
                        <button class="o_reparto_viaje_cobro_continuar" t-on-click="confirmarCobro">Continuar</button>
                    </div>
                </div>
            </div>
        </div>
    </t>

</templates>
```

- [ ] **Step 3: Add styles to `viaje_screen.scss`**

Append to the end of `addons/pos_reparto_viaje/static/src/viaje_screen.scss`:

```scss
.o_reparto_viaje_parada_info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.o_reparto_viaje_deuda {
    font-size: 1rem;
    font-weight: bold;
    color: #c62828;
    text-decoration: underline;
    width: fit-content;
}

.o_reparto_viaje_cobro_overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.o_reparto_viaje_cobro_panel {
    background-color: white;
    border-radius: 8px;
    padding: 24px;
    width: 90%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    input {
        font-size: 1.4rem;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
}

.o_reparto_viaje_cobro_medios {
    display: flex;
    gap: 8px;
}

.o_reparto_viaje_medio_btn {
    flex: 1;
    padding: 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background-color: #f5f5f5;

    &.active {
        background-color: #2e7d32;
        color: white;
        border-color: #2e7d32;
    }
}

.o_reparto_viaje_cobro_botones {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.o_reparto_viaje_cobro_continuar {
    background-color: #2e7d32;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
}
```

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_viaje/static/src/viaje_screen.js addons/pos_reparto_viaje/static/src/viaje_screen.xml addons/pos_reparto_viaje/static/src/viaje_screen.scss
git commit -m "$(cat <<'EOF'
feat(pos_reparto_viaje): UI de cobro rapido en la pantalla Viaje

Badge de deuda por parada, panel de monto/medio y doble confirmacion
(ConfirmationDialog) antes de ejecutar action_cobrar_deuda. Sin tests
automatizados de frontend (no existe infraestructura en este repo);
verificacion manual en la siguiente task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CUSzypLbLZd7AziSFz4Lk3
EOF
)"
```

---

### Task 3: Verificación manual end-to-end

Read-only/manual verification against the running dev container — not a code change beyond what's already committed, no additional commit expected unless a bug is found. Do this after Task 2.

**Files:** none (unless a bug surfaces, in which case go back to the relevant task above and fix it there).

- [ ] **Step 1: Confirm Docker is up and serving this checkout**

Run: `docker compose -p odooerp_dist up -d`
Run: `docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"`
Expected: the `addons` mount's `Source` ends in this repo's `addons` folder.

- [ ] **Step 2: Upgrade the module on the persistent container**

```bash
docker compose -p odooerp_dist restart odoo
```

(A plain restart is enough here since Task 1 only changed Python method bodies and the manifest's `depends` list — but `depends` changing means the module needs an actual upgrade, not just a restart, to install `account`/`pos_reparto_credito` if they weren't already dependencies of the running registry. Run this instead of a plain restart:)

```bash
docker exec -i odooerp_dist-odoo-1 odoo -d odoo --db_host db --db_port 5432 --db_user odoo --db_password odoo -u pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist restart odoo
```

- [ ] **Step 3: Spot-check against a real deudor via `odoo shell`**

Run this exact command from the repo root (Git Bash/MSYS on Windows) — it pipes the Python snippet directly into `odoo shell` via a heredoc, the same pattern already used earlier in this project for one-off checks, no intermediate file needed:

```bash
MSYS_NO_PATHCONV=1 docker exec -i odooerp_dist-odoo-1 odoo shell -d odoo --db_host db --db_port 5432 --db_user odoo --db_password odoo --no-http <<'EOF'
import datetime
deudor = env['res.partner'].search([('credito_monto_adeudado', '>', 0), ('user_id', '!=', False)], limit=1)
print('Cliente:', deudor.name, '| Vendedor:', deudor.user_id.name, '| Deuda:', deudor.credito_monto_adeudado)
viaje = env['reparto.viaje'].search([('chofer_id', '=', deudor.user_id.id), ('fecha', '=', datetime.date.today())], limit=1)
print('Tiene viaje hoy ese vendedor?', bool(viaje))
EOF
```

Expected: prints a real client with debt and its assigned vendedor; confirms whether that vendedor already has a viaje today (informational — if not, this specific manual check can't exercise the full UI path today, but the Task 1 automated tests already cover `action_cobrar_deuda` directly).

- [ ] **Step 4: Browser check (if a real chofer/vendedor login is available)**

Log in as one of the `camionN` users, open **Inicio → Viaje**, and confirm:
- A parada with debt shows the red "Debe $X" badge under the client name.
- Tapping the badge opens the amount/method panel, prefilled with the full debt.
- Changing the amount and tapping **Continuar** shows the confirmation dialog with the exact amount/client/method.
- Confirming closes the dialog, updates the badge to the new (lower) amount, and marks the parada visited (green background, checkmark) even though no `pos.order` was created.
- Tapping an already-visited parada still does nothing (existing behavior, unchanged).

If a live login isn't available in this session, defer this specific step to the user before considering fase 4 fully done — the automated tests in Task 1 verify the backend logic, but nothing in this plan exercises the actual OWL rendering/event wiring end-to-end.

- [ ] **Step 5: No git commit for this task** unless Step 3 or 4 finds a real bug — in that case, fix it under the relevant task above (1 or 2), re-run that task's verification, and commit there.

---

## Self-Review Notes

- **Spec coverage:** `deuda_monto` (Task 1), `action_cobrar_deuda` with ownership/amount/medio validation (Task 1), badge + panel + double confirmation (Task 2), all "Fuera de alcance" items respected (no sobrepago, no undo, no manual line selection, no Gerencia/Admin screen). All spec sections have a task.
- **Deliberately NOT tested here:** whether `action_cobrar_deuda` actually triggers `pos_reparto_comision`'s commission-line hook or `pos_reparto_caja`'s Efectivo/Transferencia classification. Both hooks fire on ANY `account.payment` matching their own criteria, regardless of what created it, and are already covered by those modules' own test suites (e.g. `pos_reparto_comision`'s `test_pago_de_credito_genera_linea_cobro_credito`). Re-testing that composition here would couple `pos_reparto_viaje`'s tests to two other modules' internals for no real safety gain. If a future refactor ever makes `action_cobrar_deuda` create the payment differently (not a plain `account.payment.create()` + `action_post()`), revisit this assumption.
- **Known limitation, not a bug:** `journal = search([('type', '=', 'cash'/'bank')], limit=1)` doesn't pin down a *specific* journal by name — it takes whichever cash/bank journal Postgres returns first. This matches the existing convention already used by every sibling test file in this project (`search([('type', '=', 'bank')], limit=1)`), and doesn't matter functionally here because `pos_reparto_caja`'s classification only cares about `journal.type`, not which specific journal record was used (confirmed by reading `comision_linea._compute_caja_medio`). If the company ever has more than one journal of a given type where the *specific* journal matters for something else (e.g. bank reconciliation against a real bank statement), this will need to become an explicit reference instead of a type search.
