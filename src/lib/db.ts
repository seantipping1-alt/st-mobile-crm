import { supabase } from './supabase'

// ─── Team ──────────────────────────────────────────────
export async function getTeam() {
  const { data, error } = await supabase.from('team').select('*').order('name')
  if (error) throw error
  return data
}

export async function saveTeamMember(member: any) {
  if (member.id) {
    const { data, error } = await supabase.from('team').update(member).eq('id', member.id).select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase.from('team').insert(member).select().single()
    if (error) throw error
    return data
  }
}

export async function deleteTeamMember(id: string) {
  const { error } = await supabase.from('team').delete().eq('id', id)
  if (error) throw error
}

// ─── Customers ─────────────────────────────────────────
export interface Customer {
  id: string
  name: string
  customer_type: 'shop' | 'individual'
  primary_contact_name: string | null
  phone: string | null
  email: string | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  address: string | null
  notes: string | null
  qb_id: string | null
  red_flag: boolean
  red_flag_reason: string | null
  discount_percent: number
  total_spend: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function getCustomers(search?: string) {
  let query = supabase.from('customers').select('*').eq('is_active', true).order('name')
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
  }
  const { data, error } = await query.limit(50)
  if (error) throw error
  return data as Customer[]
}

export async function getCustomer(id: string) {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single()
  if (error) throw error
  return data as Customer
}

export async function saveCustomer(customer: Partial<Customer>) {
  if (customer.id) {
    const { data, error } = await supabase.from('customers').update(customer).eq('id', customer.id).select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase.from('customers').insert(customer).select().single()
    if (error) throw error
    return data
  }
}

export async function deleteCustomer(id: string, hasQbLink: boolean) {
  if (hasQbLink) {
    // Soft archive — don't break QB sync
    const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) throw error
  }
}

export async function checkDuplicateCustomer(phone?: string, name?: string, excludeId?: string) {
  const matches: { type: 'phone' | 'name'; customer: Customer }[] = []
  // Exact phone match
  if (phone && phone.trim()) {
    let query = supabase.from('customers').select('*').eq('phone', phone.trim()).eq('is_active', true)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query.limit(1)
    if (data && data.length > 0) {
      matches.push({ type: 'phone', customer: data[0] as Customer })
      return matches // phone match is definitive
    }
  }
  // Fuzzy name match
  if (name && name.trim().length >= 3) {
    let query = supabase.from('customers').select('*').ilike('name', `%${name.trim()}%`).eq('is_active', true)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query.limit(3)
    if (data && data.length > 0) {
      data.forEach((c) => matches.push({ type: 'name', customer: c as Customer }))
    }
  }
  return matches
}

// ─── Vehicles ──────────────────────────────────────────
export interface Vehicle {
  id: string
  customer_id: string
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  engine: string | null
  transmission: string | null
  notes: string | null
  created_at: string
}

export async function getVehiclesByCustomer(customerId: string) {
  const { data, error } = await supabase.from('vehicles').select('*').eq('customer_id', customerId).order('year', { ascending: false })
  if (error) throw error
  return data as Vehicle[]
}

export async function saveVehicle(vehicle: Partial<Vehicle>) {
  if (vehicle.id) {
    const { data, error } = await supabase.from('vehicles').update(vehicle).eq('id', vehicle.id).select().single()
    if (error) throw error
    return data
  } else if (vehicle.vin && vehicle.customer_id) {
    // Check if VIN already exists for this customer — upsert
    const { data: existing } = await supabase.from('vehicles').select('id').eq('vin', vehicle.vin).eq('customer_id', vehicle.customer_id).maybeSingle()
    if (existing) {
      const { data, error } = await supabase.from('vehicles').update(vehicle).eq('id', existing.id).select().single()
      if (error) throw error
      return data
    }
  }
  // New vehicle
  const { data, error } = await supabase.from('vehicles').insert(vehicle).select().single()
  if (error) throw error
  return data
}

// ─── Services (canned jobs — maps to QB Products/Services) ───

export interface Service {
  id: string
  name: string
  description: string | null
  category: string
  default_rate: number
  is_active: boolean
  qb_item_id: string | null
  created_at: string
  updated_at: string
}

export async function getServices(activeOnly = true) {
  let query = supabase.from('services').select('*').order('category').order('name')
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw error
  return data as Service[]
}

export async function saveService(service: Partial<Service>) {
  if (service.id) {
    const { data, error } = await supabase.from('services').update({ ...service, updated_at: new Date().toISOString() }).eq('id', service.id).select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase.from('services').insert(service).select().single()
    if (error) throw error
    return data
  }
}

export async function deleteService(id: string) {
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw error
}

// ─── Job Line Items ─────────────────────────────────────

export interface JobLineItem {
  id: string
  job_id: string
  service_id: string | null
  vehicle_id: string | null
  description: string
  quantity: number
  unit_price: number
  category: string | null
  qb_item_id: string | null
  sort_order: number
  created_at: string
}

export async function getJobLineItems(jobId: string) {
  const { data, error } = await supabase.from('job_line_items')
    .select('*, services(name, category, default_rate)')
    .eq('job_id', jobId)
    .order('sort_order')
  if (error) throw error
  return data as (JobLineItem & { services?: Service })[]
}

export async function saveJobLineItems(jobId: string, items: Partial<JobLineItem>[]) {
  // Delete existing then insert fresh — simpler than diffing
  await supabase.from('job_line_items').delete().eq('job_id', jobId)
  if (items.length === 0) return []
  const rows = items.map((item, i) => ({
    job_id: jobId,
    service_id: item.service_id || null,
    vehicle_id: item.vehicle_id || null,
    description: item.description || '',
    quantity: item.quantity || 1,
    unit_price: item.unit_price || 0,
    category: item.category || null,
    qb_item_id: item.qb_item_id || null,
    sort_order: i,
  }))
  const { data, error } = await supabase.from('job_line_items').insert(rows).select()
  if (error) throw error
  return data
}

// ─── Job Vehicles (junction — multiple vehicles per job) ──

export async function getJobVehicles(jobId: string) {
  const { data, error } = await supabase.from('job_vehicles')
    .select('*, vehicles(id, vin, year, make, model, engine)')
    .eq('job_id', jobId)
    .order('sort_order')
  if (error) throw error
  return data || []
}

export async function saveJobVehicles(jobId: string, vehicleIds: string[]) {
  await supabase.from('job_vehicles').delete().eq('job_id', jobId)
  if (vehicleIds.length === 0) return []
  const rows = vehicleIds.map((vid, i) => ({ job_id: jobId, vehicle_id: vid, sort_order: i }))
  const { data, error } = await supabase.from('job_vehicles').insert(rows).select()
  if (error) throw error
  return data
}

// ─── Jobs ──────────────────────────────────────────────

export interface Job {
  id: string
  customer_id: string | null
  vehicle_id: string | null
  assigned_to: string | null
  job_type: 'diagnostic' | 'programming' | 'adas' | 'keys' | 'other'
  status: 'scheduled' | 'in_progress' | 'complete' | 'invoiced' | 'paid' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  shop_name: string | null
  shop_ro_number: string | null
  problem_description: string | null
  diagnostic_codes: string[] | null
  internal_notes: string | null
  gcal_event_id: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  scheduled_location: string | null
  completed_at: string | null
  findings: string | null
  qb_invoice_id: string | null
  qb_estimate_id: string | null
  invoice_number: string | null
  created_at: string
  updated_at: string
}

export async function getJobs(filters?: { status?: string; assigned_to?: string }) {
  let query = supabase.from('jobs')
    .select('*, customers(name)')
    .order('scheduled_start', { ascending: true })
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  const { data, error } = await query.limit(100)
  if (error) throw error
  
  if (data) {
    // Fetch team names
    const teamIds = [...new Set(data.map((j: any) => j.assigned_to).filter(Boolean))]
    let teamMap: Record<string, any> = {}
    if (teamIds.length > 0) {
      const { data: teamData } = await supabase.from('team').select('id,name,color').in('id', teamIds)
      teamMap = Object.fromEntries((teamData || []).map((t: any) => [t.id, t]))
    }

    // Fetch vehicles via junction table
    const jobIds = data.map((j: any) => j.id)
    const { data: jvData } = await supabase.from('job_vehicles')
      .select('job_id, vehicles(year,make,model,vin)')
      .in('job_id', jobIds)
      .order('sort_order')
    const vehicleMap: Record<string, any[]> = {}
    ;(jvData || []).forEach((jv: any) => {
      if (!vehicleMap[jv.job_id]) vehicleMap[jv.job_id] = []
      if (jv.vehicles) vehicleMap[jv.job_id].push(jv.vehicles)
    })

    // Fetch line item totals
    const { data: liData } = await supabase.from('job_line_items')
      .select('job_id, quantity, unit_price')
      .in('job_id', jobIds)
    const totalMap: Record<string, number> = {}
    ;(liData || []).forEach((li: any) => {
      totalMap[li.job_id] = (totalMap[li.job_id] || 0) + ((li.quantity || 1) * (li.unit_price || 0))
    })

    return data.map((j: any) => ({
      ...j,
      team: teamMap[j.assigned_to] || null,
      job_vehicles: vehicleMap[j.id] || [],
      vehicles: vehicleMap[j.id]?.[0] || null,
      total: totalMap[j.id] || 0,
    }))
  }
  return data
}

export async function deleteJob(id: string) {
  const { error } = await supabase.from('jobs').delete().eq('id', id)
  if (error) throw error
}

export async function saveJob(job: Partial<Job>) {
  if (job.id) {
    const { data, error } = await supabase.from('jobs').update(job).eq('id', job.id).select().single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase.from('jobs').insert(job).select().single()
    if (error) throw error
    return data
  }
}
