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
  created_at: string
  updated_at: string
}

export async function getCustomers(search?: string) {
  let query = supabase.from('customers').select('*').order('name')
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
    .select('*, customers(name), vehicles(year,make,model,vin)')
    .order('scheduled_start', { ascending: true })
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  const { data, error } = await query.limit(100)
  if (error) throw error
  
  // Team names are fetched separately to avoid embedding ambiguity
  if (data) {
    const teamIds = [...new Set(data.map((j: any) => j.assigned_to).filter(Boolean))]
    if (teamIds.length > 0) {
      const { data: teamData } = await supabase.from('team').select('id,name,color').in('id', teamIds)
      const teamMap = Object.fromEntries((teamData || []).map((t: any) => [t.id, t]))
      return data.map((j: any) => ({ ...j, team: teamMap[j.assigned_to] || null }))
    }
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
