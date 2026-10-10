export class ShippingError extends Error {
  status: number
  constructor(message: string, status = 502) { super(message); this.status = status }
}

type Json = Record<string, unknown>
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const text = (value: unknown, max = 100) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
export const allowedCouriers = new Set(['jne', 'jnt', 'sicepat'])

export interface Destination { id: number; label: Record<string, unknown> }
export interface Rate { courier_code: string; courier_name: string; service: string; amount: number; etd: string }

export class RajaOngkirShippingCostProvider {
  constructor(private readonly apiKey: string, private readonly baseUrl: string, private readonly send: typeof fetch = fetch) {}
  private url(path: string) { return new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/').toString() }
  private async request(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.send(url, { ...init, signal: AbortSignal.timeout(10000) })
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue
        return response
      } catch {
        // A single retry handles a transient network error without hiding a provider outage.
      }
    }
    throw new ShippingError('Shipping provider is unavailable. Please try again.')
  }
  async destinations(query: string): Promise<Destination[]> {
    const response = await this.request(this.url('destination/domestic-destination?' + new URLSearchParams({ search: query, limit: '10', offset: '0' })), { headers: { key: this.apiKey } })
    if (response.status === 404) return []
    if (!response.ok) throw new ShippingError('Shipping destination search is unavailable. Please try again.', response.status === 429 ? 429 : 502)
    const body = record(await response.json()), rows = Array.isArray(body.data) ? body.data : []
    return rows.flatMap(row => {
      const source = record(row), rawId = Number(source.id)
      if (!Number.isSafeInteger(rawId) || rawId <= 0) return []
      const name = text(source.label ?? source.name ?? source.subdistrict_name ?? source.city_name, 300)
      if (!name) return []
      return [{ id: rawId, label: { name, city: text(source.city_name, 160), district: text(source.subdistrict_name ?? source.district_name, 160), province: text(source.province_name, 160), postal_code: text(source.zip_code ?? source.postal_code, 24) } }]
    })
  }
  async rates(origin: number, destination: number, weight: number, courier: string): Promise<Rate[]> {
    if (!Number.isSafeInteger(origin) || origin <= 0 || !Number.isSafeInteger(destination) || destination <= 0 || !Number.isSafeInteger(weight) || weight <= 0 || !allowedCouriers.has(courier)) throw new ShippingError('Invalid shipping quote input', 400)
    const form = new URLSearchParams({ origin: String(origin), destination: String(destination), weight: String(weight), courier })
    const response = await this.request(this.url('calculate/domestic-cost'), { method: 'POST', headers: { key: this.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
    if (!response.ok) throw new ShippingError('Shipping quote is unavailable. Please try again.', response.status === 429 ? 429 : 502)
    const body = record(await response.json()), rows = Array.isArray(body.data) ? body.data : []
    return rows.flatMap(row => {
      const source = record(row), amount = Number(source.cost), service = text(source.service, 100), name = text(source.name, 100), code = text(source.code, 30)?.toLowerCase()
      if (!Number.isSafeInteger(amount) || amount <= 0 || !service || !name || !code || code !== courier) return []
      return [{ courier_code: code, courier_name: name, service, amount, etd: text(source.etd, 100) ?? '' }]
    })
  }
}
