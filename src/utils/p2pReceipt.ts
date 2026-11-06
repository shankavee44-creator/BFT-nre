import type { P2PTransferRecord } from './p2pTransfer.ts';

export function downloadP2PTransferReceipt(record: P2PTransferRecord): void {
  if (typeof window === 'undefined') return;
  const isSent = record.direction === 'sent' || record.type === 'P2P Transfer Sent';
  const title = isSent ? 'P2P Transfer Receipt (Sent)' : 'P2P Deposit Receipt (Received)';
  const formattedDate = new Date(record.createdAt).toUTCString();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} - #${record.id}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace, sans-serif;
            background: #ffffff;
            color: #111111;
            padding: 40px;
            max-width: 650px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #111111;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .logo {
            font-size: 20px;
            font-weight: 900;
            letter-spacing: 2px;
            color: #ff8800;
            text-transform: uppercase;
          }
          .title {
            font-size: 16px;
            font-weight: bold;
            margin-top: 5px;
            text-transform: uppercase;
          }
          .section {
            margin-bottom: 20px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px dashed #dddddd;
            font-size: 13px;
          }
          .label {
            font-weight: bold;
            color: #555555;
          }
          .value {
            font-weight: bold;
            color: #111111;
            text-align: right;
          }
          .amount-box {
            background: #f9f9f9;
            border: 1px solid #cccccc;
            padding: 15px;
            text-align: center;
            margin: 25px 0;
            border-radius: 8px;
          }
          .amount-val {
            font-size: 24px;
            font-weight: 900;
            color: ${isSent ? '#e11d48' : '#059669'};
          }
          .footer {
            text-align: center;
            font-size: 11px;
            color: #777777;
            margin-top: 40px;
            border-top: 1px solid #eeeeee;
            padding-top: 15px;
          }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">BFT Institutional P2P Network</div>
          <div class="title">${title}</div>
        </div>

        <div class="section">
          <div class="row">
            <span class="label">Transaction ID:</span>
            <span class="value">${record.id}</span>
          </div>
          <div class="row">
            <span class="label">Timestamp (UTC):</span>
            <span class="value">${formattedDate}</span>
          </div>
          <div class="row">
            <span class="label">Transfer Type:</span>
            <span class="value">${record.type}</span>
          </div>
          <div class="row">
            <span class="label">Sender Trader ID:</span>
            <span class="value">#${record.senderNumericId}</span>
          </div>
          <div class="row">
            <span class="label">Receiver Trader ID:</span>
            <span class="value">#${record.receiverNumericId}</span>
          </div>
          <div class="row">
            <span class="label">Source Wallet:</span>
            <span class="value">Self-Capital Balance (Live)</span>
          </div>
          <div class="row">
            <span class="label">Status:</span>
            <span class="value" style="color: #059669; text-transform: uppercase;">${record.status}</span>
          </div>
        </div>

        <div class="amount-box">
          <div style="font-size: 11px; color: #666666; text-transform: uppercase; margin-bottom: 5px;">Transfer Amount</div>
          <div class="amount-val">${record.signedAmountFormatted} USD</div>
        </div>

        <div class="footer">
          <p>This is an electronically generated official receipt from the BFT P2P Transfer Settlement Engine.</p>
          <p>Secure Self-Capital Ledger verification hash: ${btoa(record.id + record.createdAt).slice(0, 24)}</p>
          <div class="no-print" style="margin-top: 20px;">
            <button onclick="window.print();" style="background: #ff8800; color: #000; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer;">Print / Save as PDF</button>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=700,height=800');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
