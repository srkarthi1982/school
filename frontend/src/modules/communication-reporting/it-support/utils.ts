// Display label for a ticket — the backend uses plain integer ids.
export function ticketCode(id: number): string {
  return 'TCK-' + String(id).padStart(3, '0')
}
