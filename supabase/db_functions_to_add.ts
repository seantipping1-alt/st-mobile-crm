// ─── Tasks per Employee ─────────────────────────────────

export async function getTasksForMember(teamMemberId: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', teamMemberId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data
}

// ─── Employee Reviews ───────────────────────────────────

export interface EmployeeReview {
  id: string
  team_member_id: string
  period: string
  review_date: string | null
  employee_goal: string | null
  most_valuable_skill: string | null
  skill_needs_work: string | null
  biggest_issue: string | null
  whats_blocking: string | null
  what_sean_do_differently: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function getReviewsForMember(teamMemberId: string) {
  const { data, error } = await supabase
    .from('employee_reviews')
    .select('*')
    .eq('team_member_id', teamMemberId)
    .order('review_date', { ascending: false })
  if (error) throw error
  return data as EmployeeReview[]
}

export async function createReview(data: Partial<EmployeeReview>) {
  const { data: review, error } = await supabase
    .from('employee_reviews')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return review as EmployeeReview
}

export async function updateReview(id: string, data: Partial<EmployeeReview>) {
  const { data: review, error } = await supabase
    .from('employee_reviews')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return review as EmployeeReview
}

// ─── Employee Goals ─────────────────────────────────────

export interface EmployeeGoal {
  id: string
  review_id: string | null
  team_member_id: string
  title: string
  target_date: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  notes: { text: string; by_name: string; at: string }[]
  created_at: string
}

export async function getGoalsForReview(reviewId: string) {
  const { data, error } = await supabase
    .from('employee_goals')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as EmployeeGoal[]
}

export async function getGoalsForMember(teamMemberId: string) {
  const { data, error } = await supabase
    .from('employee_goals')
    .select('*')
    .eq('team_member_id', teamMemberId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as EmployeeGoal[]
}

export async function createGoal(data: Partial<EmployeeGoal>) {
  const { data: goal, error } = await supabase
    .from('employee_goals')
    .insert(data)
    .select()
    .single()
  if (error) throw error
  return goal as EmployeeGoal
}

export async function updateGoal(id: string, data: Partial<EmployeeGoal>) {
  const { data: goal, error } = await supabase
    .from('employee_goals')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return goal as EmployeeGoal
}

export async function addGoalNote(goalId: string, note: { text: string; by_name: string; at: string }) {
  // Fetch current notes, append, then update
  const { data: goal, error: fetchError } = await supabase
    .from('employee_goals')
    .select('notes')
    .eq('id', goalId)
    .single()
  if (fetchError) throw fetchError

  const currentNotes = (goal?.notes as any[]) || []
  const updatedNotes = [...currentNotes, note]

  const { data: updated, error } = await supabase
    .from('employee_goals')
    .update({ notes: updatedNotes })
    .eq('id', goalId)
    .select()
    .single()
  if (error) throw error
  return updated as EmployeeGoal
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from('employee_goals').delete().eq('id', id)
  if (error) throw error
}
