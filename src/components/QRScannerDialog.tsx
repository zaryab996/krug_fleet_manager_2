/**
 * QRScannerDialog – Öffnet die Gerätekamera zum Abscannen eines QR-Codes.
 * Kodiertes Format: https://www.ksmeu.com/<VIN>
 * Bei Treffer: Navigation zu /vehicles/<VIN>
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScanQrCode, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
}

const SCANNER_ID = 'fleet-qr-scanner-container';

export default function QRScannerDialog({ open, onClose }: QRScannerDialogProps) {
  const navigate  = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status,  setStatus]  = useState<'starting' | 'scanning' | 'success' | 'error' | 'no-camera'>('starting');
  const [message, setMessage] = useState('');
  const [scannedVin, setScannedVin] = useState('');

  // Scanner starten wenn Dialog öffnet
  useEffect(() => {
    if (!open) return;
    setStatus('starting');
    setMessage('');
    setScannedVin('');

    // Kleines Delay damit das DOM-Element gerendert ist
    const timer = setTimeout(async () => {
      try {
        const qr = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = qr;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          setStatus('no-camera');
          return;
        }

        // Bevorzuge Rückkamera (für Smartphones)
        const backCam = cameras.find(c =>
          c.label.toLowerCase().includes('back') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        ) ?? cameras[cameras.length - 1];

        await qr.start(
          backCam.id,
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            // QR-Code erkannt
            handleScan(decodedText, qr);
          },
          () => { /* scan frame error – ignorieren */ }
        );
        setStatus('scanning');
      } catch (err) {
        console.error('[QRScanner]', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
          setStatus('no-camera');
          setMessage('Kamerazugriff verweigert. Bitte Kameraberechtigung erteilen und erneut versuchen.');
        } else {
          setStatus('error');
          setMessage('Kamera konnte nicht gestartet werden.');
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopScanner() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear();
      scannerRef.current = null;
    }
  }

  function handleScan(text: string, qr: Html5Qrcode) {
    // Format: https://www.ksmeu.com/VIN  OR direkt die VIN
    let vin = text.trim();
    try {
      const url = new URL(text);
      // Letztes Path-Segment = VIN
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0) vin = parts[parts.length - 1];
    } catch {
      // kein URL-Format → Text direkt als VIN behandeln
    }

    if (!vin) return;

    // Scanner stoppen
    qr.stop().catch(() => {});
    qr.clear();
    scannerRef.current = null;

    setScannedVin(vin);
    setStatus('success');
    setMessage(`VIN: ${vin}`);

    // Kurze Erfolgs-Anzeige, dann navigieren
    setTimeout(() => {
      onClose();
      navigate(ROUTE_PATHS.VEHICLE_DETAIL.replace(':vin', encodeURIComponent(vin)));
    }, 900);
  }

  function handleClose() {
    stopScanner();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanQrCode className="w-5 h-5 text-primary" />
            QR-Code scannen
          </DialogTitle>
          <DialogDescription className="text-xs">
            Halte die Kamera auf den Fahrzeug-QR-Code – die App öffnet das Fahrzeug automatisch.
          </DialogDescription>
        </DialogHeader>

        {/* Kamera-Vorschau */}
        <div className="relative bg-black">
          {/* html5-qrcode rendert in dieses div */}
          <div id={SCANNER_ID} className="w-full" style={{ minHeight: 280 }} />

          {/* Status-Overlay */}
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="flex flex-col items-center gap-2 text-white">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Kamera wird gestartet…</p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/75">
              <div className="flex flex-col items-center gap-2 text-white text-center px-4">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
                <p className="text-sm font-semibold">QR-Code erkannt!</p>
                <p className="text-xs text-white/70 font-mono">{scannedVin}</p>
                <p className="text-xs text-white/50">Weiterleitung…</p>
              </div>
            </div>
          )}

          {(status === 'error' || status === 'no-camera') && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="flex flex-col items-center gap-3 text-white text-center px-6">
                <XCircle className="w-10 h-10 text-red-400" />
                <p className="text-sm font-semibold">
                  {status === 'no-camera' ? 'Keine Kamera gefunden' : 'Fehler'}
                </p>
                <p className="text-xs text-white/60 leading-relaxed">
                  {message || 'Kamerazugriff nicht möglich. Stelle sicher, dass die App Kameraberechtigung hat.'}
                </p>
              </div>
            </div>
          )}

          {/* Scan-Rahmen wenn aktiv */}
          {status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 border-2 border-white/60 rounded-xl relative">
                {/* Ecken */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl-md" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr-md" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl-md" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br-md" />
                {/* Scan-Linie */}
                <div className="absolute left-2 right-2 h-0.5 bg-primary/80 animate-scan-line" />
              </div>
              <p className="absolute bottom-4 text-white/70 text-xs">QR-Code in den Rahmen halten</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-3">
          <Button variant="outline" className="w-full" onClick={handleClose}>Abbrechen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
