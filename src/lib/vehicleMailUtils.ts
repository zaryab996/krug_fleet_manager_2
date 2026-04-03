/**
 * vehicleMailUtils.ts
 * Hilfsfunktionen für das Fahrzeug-E-Mail-System.
 * Nutzt die zentrale EmailSettings-Konfiguration aus emailService.ts.
 */

import { loadEmailSettings, sendVehicleEmail, type SendResult } from './emailService';

/** Gibt die konfigurierte Domain für Fahrzeug-Adressen zurück */
export function getMailDomain(): string {
  return loadEmailSettings().mailDomain || 'ksmeu.com';
}

/**
 * Generiert die E-Mail-Adresse eines Fahrzeugs.
 * Beispiel: VIN = "WBA12345678" → fzg.WBA12345678@ksmeu.com
 */
export function getVehicleEmail(vin: string): string {
  const clean = vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `fzg.${clean}@${getMailDomain()}`;
}

/**
 * Ermittelt die VIN aus einer Fahrzeug-E-Mail-Adresse.
 * Gibt null zurück wenn die Adresse nicht dem Schema entspricht.
 */
export function vinFromEmail(email: string): string | null {
  const domain = getMailDomain().replace('.', '\\.');
  const match = email.toLowerCase().match(new RegExp(`^fzg\\.([a-z0-9]+)@${domain}$`));
  if (!match) return null;
  return match[1].toUpperCase();
}

/**
 * Sendet eine E-Mail aus dem Kontext eines Fahrzeugs.
 * Nutzt sendVehicleEmail() aus emailService.ts mit den gespeicherten Settings.
 */
export async function sendVehicleMail(params: {
  fromVin:  string;
  toEmail:  string;
  subject:  string;
  body:     string;
}): Promise<SendResult> {
  const fromEmail = getVehicleEmail(params.fromVin);
  return sendVehicleEmail({
    fromVin:   params.fromVin,
    fromEmail,
    toEmail:   params.toEmail,
    subject:   params.subject,
    body:      params.body,
  });
}
