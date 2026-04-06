/**
 * NewVehicleDialog – Manuelles Anlegen eines Fahrzeugs (nur Admin)
 */
import { useState } from 'react';
import { PlusCircle, Car, AlertCircle } from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useFleetStore, useAuthStore } from '@/hooks/useStore';
import { generateId } from '@/lib/index';
import type { VehicleRecord } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELDS: { key: string; label: string; required?: boolean; type?: 'text' | 'date' | 'number' | 'select'; options?: string[] }[] = [
  { key: 'vin',              label: 'VIN',                    required: true },
  { key: 'Hersteller',       label: 'Hersteller',             required: true },
  { key: 'Haupttyp',         label: 'Modell / Haupttyp' },
  { key: 'Motorart',         label: 'Motorart', type: 'select',
    options: ['Diesel', 'Benzin', 'Elektro', 'Hybrid', 'Erdgas', 'Sonstige'] },
  { key: 'Erstzulassung',    label: 'Erstzulassung',          type: 'date' },
  { key: 'Reparaturkosten netto', label: 'Reparaturkosten (netto)', type: 'number' },
  { key: 'WBWert netto',     label: 'Wiederbeschaffungswert (netto)', type: 'number' },
  { key: 'Besichtigungsort', label: 'Besichtigungsort' },
  { key: 'Besichtigung1 Datum', label: 'Besichtigung Datum', type: 'date' },
];

const empty = () => Object.fromEntries(FIELDS.map(f => [f.key, ''])) as Record<string, string>;

export default function NewVehicleDialog({ open, onClose }: Props) {
  const { addVehicle, getLiveVehicles } = useFleetStore();
  const { currentUser } = useAuthStore();

  const [values,  setValues]  = useState<Record<string, string>>(empty());
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState(false);

  function reset() {
    setValues(empty());
    setErrors({});
    setSaving(false);
    setSuccess(false);
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!values.vin.trim()) errs.vin = 'VIN ist Pflichtfeld';
    else if (values.vin.trim().length < 5) errs.vin = 'VIN zu kurz (min. 5 Zeichen)';
    else {
      const exists = getLiveVehicles().some(r => r.vin.toLowerCase() === values.vin.trim().toLowerCase());
      if (exists) errs.vin = 'Diese VIN existiert bereits';
    }
    if (!values['Hersteller'].trim()) errs['Hersteller'] = 'Hersteller ist Pflichtfeld';
    return errs;
  }

  function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const record: VehicleRecord = {
      vin: values.vin.trim().toUpperCase(),
      _createdManually: true,
      _createdAt: new Date().toISOString(),
      _createdBy: currentUser?.name ?? 'Admin',
    };

    FIELDS.forEach(f => {
      if (f.key === 'vin') return;
      const v = values[f.key]?.trim();
      if (v) {
        if (f.type === 'number') record[f.key] = parseFloat(v.replace(',', '.'));
        else record[f.key] = v;
      }
    });

    addVehicle(record);
    setSaving(false);
    setSuccess(true);
    setTimeout(() => { reset(); onClose(); }, 1200);
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" />
            Neues Fahrzeug anlegen
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <PlusCircle className="w-7 h-7 text-green-600" />
            </div>
            <p className="font-semibold text-green-700">Fahrzeug erfolgreich angelegt!</p>
            <p className="text-sm text-muted-foreground mt-1">VIN: {values.vin.toUpperCase()}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-2">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <Label className="text-xs font-medium mb-1 block">
                    {f.label}
                    {f.required && <span className="text-destructive ml-1">*</span>}
                  </Label>

                  {f.type === 'select' ? (
                    <Select
                      value={values[f.key]}
                      onValueChange={v => setValues(s => ({ ...s, [f.key]: v }))}
                    >
                      <SelectTrigger className={`h-9 text-sm ${errors[f.key] ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder="Bitte wählen…" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options!.map(o => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                      value={values[f.key]}
                      onChange={e => {
                        setValues(s => ({ ...s, [f.key]: e.target.value }));
                        if (errors[f.key]) setErrors(s => ({ ...s, [f.key]: '' }));
                      }}
                      className={`h-9 text-sm ${errors[f.key] ? 'border-destructive' : ''}`}
                      placeholder={f.key === 'vin' ? 'z.B. W1V44760313759875' : ''}
                      style={f.key === 'vin' ? { textTransform: 'uppercase', fontFamily: 'monospace' } : {}}
                    />
                  )}

                  {errors[f.key] && (
                    <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                      <AlertCircle className="w-3 h-3" /> {errors[f.key]}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <PlusCircle className="w-4 h-4" />
                Fahrzeug anlegen
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
