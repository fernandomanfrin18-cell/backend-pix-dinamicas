const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pagamentos = {};

app.get('/health', (req, res) => {
  res.json({ ok: true, pagamentos_confirmados: Object.keys(pagamentos).length });
});

app.post('/webhook', (req, res) => {
  try {
    const body = req.body;
    console.log('[WEBHOOK] Recebido:', JSON.stringify(body));
    const transactionId = body.transaction_id || body.id || body.order_id;
    const status = (body.status || '').toLowerCase();
    const pago = status === 'approved' || status === 'paid' || status === 'completed' || status === 'success';
    if (!transactionId) return res.status(200).json({ received: true });
    pagamentos[String(transactionId)] = {
      status: pago ? 'paid' : (status || 'pending'),
      confirmed_at: pago ? new Date().toISOString() : null,
      data: body
    };
    console.log('[WEBHOOK]', pago ? 'PAGO' : 'PENDENTE', transactionId);
    res.status(200).json({ received: true, transaction_id: transactionId, status: pagamentos[String(transactionId)].status });
  } catch (err) {
    console.error('[WEBHOOK] Erro:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
});

app.get('/status/:transaction_id', (req, res) => {
  const id = req.params.transaction_id;
  const r = pagamentos[String(id)];
  if (!r) return res.json({ transaction_id: id, status: 'pending', paid: false });
  res.json({ transaction_id: id, status: r.status, paid: r.status === 'paid', confirmed_at: r.confirmed_at });
});

app.get('/admin/pagamentos', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Nao autorizado' });
  res.json(pagamentos);
});

app.listen(PORT, () => console.log('Backend PIX rodando na porta ' + PORT));
