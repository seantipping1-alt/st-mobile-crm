import { useState, useEffect } from 'react'
import { toast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, MessageSquarePlus, X, Target } from 'lucide-react'
import {
  getGoalsForReview, createGoal, updateGoal, addGoalNote, deleteGoal,
  type EmployeeGoal,
} from '../lib/db'

const OWNER_ID = '095969b8-e5da-45a1-a26e-483fac0cc94c'

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-600 text-gray-200',
  in_progress: 'bg-amber-600/30 text-amber-300',
  completed: 'bg-green-600/30 text-green-300',
}

const REVIEW_FIELDS = [
  { key: 'most_valuable_skill', label: 'Most Valuable Skill' },
  { key: 'skill_needs_work', label: 'Skill That Needs the Most Work' },
  { key: 'biggest_issue', label: 'Biggest Issue' },
  { key: 'whats_blocking', label: "What's Blocking You From Doing More" },
  { key: 'what_sean_do_differently', label: 'What Can Sean Do Differently' },
]

function formatNoteTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getCurrentPeriod(): string {
  const now = new Date()
  const q = Math.ceil((now.getMonth() + 1) / 3)
  return `Q${q} ${now.getFullYear()}`
}

interface Props {
  teamMemberId: string
  teamMemberName: string
}

export default function ReviewsGoalsTab({ teamMemberId, teamMemberName }: Props) {
  const { user } = useAuth()
  const isOwner = user?.id === OWNER_ID

  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedReview, setExpandedReview] = useState<string | null>(null)
  const [goals, setGoals] = useState<Record<string, EmployeeGoal[]>>({})

  // New review
  const [showNewReview, setShowNewReview] = useState(false)
  const [newPeriod, setNewPeriod] = useState(getCurrentPeriod())
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [savingReview, setSavingReview] = useState(false)

  // Review field note entry
  const [fieldNoteTarget, setFieldNoteTarget] = useState<{ reviewId: string; field: string } | null>(null)
  const [fieldNoteText, setFieldNoteText] = useState('')

  // New goal
  const [showNewGoal, setShowNewGoal] = useState<string | null>(null)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [savingGoal, setSavingGoal] = useState(false)

  // Edit goal
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [editGoalTitle, setEditGoalTitle] = useState('')
  const [editGoalDate, setEditGoalDate] = useState('')

  // Goal notes
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    loadReviews()
  }, [teamMemberId])

  async function loadReviews() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('employee_reviews')
        .select('*')
        .eq('team_member_id', teamMemberId)
        .order('review_date', { ascending: false })
      if (error) throw error
      setReviews(data || [])
      if (data && data.length > 0) {
        setExpandedReview(data[0].id)
        await loadGoals(data[0].id)
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function loadGoals(reviewId: string) {
    try {
      const data = await getGoalsForReview(reviewId)
      setGoals(prev => ({ ...prev, [reviewId]: data }))
    } catch (err) {
      console.error(err)
    }
  }

  async function toggleExpand(reviewId: string) {
    if (expandedReview === reviewId) {
      setExpandedReview(null)
    } else {
      setExpandedReview(reviewId)
      if (!goals[reviewId]) {
        await loadGoals(reviewId)
      }
    }
  }

  async function handleCreateReview() {
    setSavingReview(true)
    try {
      const { data: review, error } = await supabase
        .from('employee_reviews')
        .insert({
          team_member_id: teamMemberId,
          period: newPeriod,
          review_date: newDate ? new Date(newDate).toISOString() : null,
          created_by: user?.id || null,
        })
        .select()
        .single()
      if (error) throw error
      setReviews([review, ...reviews])
      setExpandedReview(review.id)
      setGoals(prev => ({ ...prev, [review.id]: [] }))
      setShowNewReview(false)
      setNewPeriod(getCurrentPeriod())
      setNewDate(new Date().toISOString().split('T')[0])
      toast('Review created ✓')
    } catch (err) {
      console.error(err)
      toast('Failed to create review')
    }
    setSavingReview(false)
  }

  async function handleDeleteReview(id: string) {
    if (!confirm('Delete this review and all its goals? This cannot be undone.')) return
    try {
      await supabase.from('employee_goals').delete().eq('review_id', id)
      await supabase.from('employee_reviews').delete().eq('id', id)
      setReviews(reviews.filter(r => r.id !== id))
      if (expandedReview === id) setExpandedReview(null)
      toast('Review deleted')
    } catch (err) {
      console.error(err)
      toast('Failed to delete review')
    }
  }

  async function handleAddFieldNote(reviewId: string, field: string) {
    if (!fieldNoteText.trim() || !user) return
    const review = reviews.find(r => r.id === reviewId)
    if (!review) return
    const existing = Array.isArray(review[field]) ? review[field] : []
    const displayName = user.email?.split('@')[0] || 'Unknown'
    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1)
    const newEntry = { text: fieldNoteText.trim(), by_name: capitalizedName, at: new Date().toISOString() }
    const updated = [...existing, newEntry]

    try {
      const { error } = await supabase
        .from('employee_reviews')
        .update({ [field]: updated })
        .eq('id', reviewId)
      if (error) throw error
      setReviews(reviews.map(r => r.id === reviewId ? { ...r, [field]: updated } : r))
      setFieldNoteTarget(null)
      setFieldNoteText('')
      toast('Entry added ✓')
    } catch (err) {
      console.error(err)
      toast('Failed to add entry')
    }
  }

  async function handleDeleteFieldNote(reviewId: string, field: string, idx: number) {
    const review = reviews.find(r => r.id === reviewId)
    if (!review) return
    const existing = Array.isArray(review[field]) ? [...review[field]] : []
    existing.splice(idx, 1)

    try {
      const { error } = await supabase
        .from('employee_reviews')
        .update({ [field]: existing })
        .eq('id', reviewId)
      if (error) throw error
      setReviews(reviews.map(r => r.id === reviewId ? { ...r, [field]: existing } : r))
      toast('Entry removed')
    } catch (err) {
      console.error(err)
      toast('Failed to remove entry')
    }
  }

  async function handleCreateGoal(reviewId: string) {
    if (!goalTitle.trim()) return
    setSavingGoal(true)
    try {
      const goal = await createGoal({
        review_id: reviewId,
        team_member_id: teamMemberId,
        title: goalTitle.trim(),
        target_date: goalDate || null,
        status: 'not_started',
      })
      setGoals(prev => ({
        ...prev,
        [reviewId]: [...(prev[reviewId] || []), goal],
      }))
      setGoalTitle('')
      setGoalDate('')
      setShowNewGoal(null)
      toast('Goal added ✓')
    } catch (err) {
      console.error(err)
      toast('Failed to add goal')
    }
    setSavingGoal(false)
  }

  async function handleGoalStatusChange(goalId: string, reviewId: string, newStatus: string) {
    try {
      const updated = await updateGoal(goalId, { status: newStatus as any })
      setGoals(prev => ({
        ...prev,
        [reviewId]: (prev[reviewId] || []).map(g => g.id === goalId ? updated : g),
      }))
    } catch (err) {
      console.error(err)
      toast('Failed to update status')
    }
  }

  async function handleSaveGoalEdit(goalId: string, reviewId: string) {
    if (!editGoalTitle.trim()) return
    try {
      const updated = await updateGoal(goalId, {
        title: editGoalTitle.trim(),
        target_date: editGoalDate || null,
      })
      setGoals(prev => ({
        ...prev,
        [reviewId]: (prev[reviewId] || []).map(g => g.id === goalId ? updated : g),
      }))
      setEditingGoal(null)
      toast('Goal updated ✓')
    } catch (err) {
      console.error(err)
      toast('Failed to update goal')
    }
  }

  async function handleAddGoalNote(goalId: string, reviewId: string) {
    if (!noteText.trim() || !user) return
    setSavingNote(true)
    const displayName = user.email?.split('@')[0] || 'Unknown'
    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1)
    try {
      const updated = await addGoalNote(goalId, {
        text: noteText.trim(),
        by_name: capitalizedName,
        at: new Date().toISOString(),
      })
      setGoals(prev => ({
        ...prev,
        [reviewId]: (prev[reviewId] || []).map(g => g.id === goalId ? updated : g),
      }))
      toast('Note added ✓')
      setNoteTarget(null)
      setNoteText('')
    } catch (err) {
      console.error(err)
      toast('Failed to add note')
    }
    setSavingNote(false)
  }

  async function handleDeleteGoal(goalId: string, reviewId: string) {
    if (!confirm('Delete this goal?')) return
    try {
      await deleteGoal(goalId)
      setGoals(prev => ({
        ...prev,
        [reviewId]: (prev[reviewId] || []).filter(g => g.id !== goalId),
      }))
      toast('Goal deleted')
    } catch (err) {
      console.error(err)
      toast('Failed to delete goal')
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">{teamMemberName}'s Reviews & Goals</h2>
        {isOwner && (
          <button
            onClick={() => setShowNewReview(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-primary)] hover:bg-red-700 text-white rounded-lg text-sm font-medium transition min-h-[44px]"
          >
            <Plus size={16} /> New Review
          </button>
        )}
      </div>

      {reviews.length === 0 && (
        <div className="bg-[var(--color-surface)] rounded-lg p-8 text-center text-[var(--color-muted)] text-sm">
          No reviews yet.{isOwner ? ' Create one to get started.' : ''}
        </div>
      )}

      {/* Review list */}
      {reviews.map(review => {
        const isExpanded = expandedReview === review.id
        const reviewGoals = goals[review.id] || []

        return (
          <div key={review.id} className="bg-[var(--color-surface)] rounded-lg border border-gray-700 overflow-hidden">
            {/* Review header */}
            <button
              onClick={() => toggleExpand(review.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={16} className="text-[var(--color-muted)]" /> : <ChevronRight size={16} className="text-[var(--color-muted)]" />}
                <div className="text-left">
                  <span className="text-white font-medium">{review.period}</span>
                  {review.review_date && (
                    <span className="text-[var(--color-muted)] text-xs ml-2">
                      {new Date(review.review_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {reviewGoals.length > 0 && (
                  <span className="text-xs text-[var(--color-muted)]">
                    {reviewGoals.filter(g => g.status === 'completed').length}/{reviewGoals.length} goals
                  </span>
                )}
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-700 p-4 space-y-4">
                {/* Review fields — each is a list of notes/entries */}
                <div className="space-y-4">
                  {REVIEW_FIELDS.map(field => {
                    const entries = Array.isArray(review[field.key]) ? review[field.key] : []
                    const isAddingNote = fieldNoteTarget?.reviewId === review.id && fieldNoteTarget?.field === field.key

                    return (
                      <div key={field.key}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-[var(--color-muted)] font-medium">{field.label}</p>
                          <button
                            onClick={() => { setFieldNoteTarget({ reviewId: review.id, field: field.key }); setFieldNoteText('') }}
                            className="text-gray-500 hover:text-blue-400 min-h-[36px] min-w-[28px] flex items-center justify-center"
                            title="Add entry"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        {entries.length === 0 && !isAddingNote && (
                          <p className="text-xs text-[var(--color-muted)] italic">No entries yet</p>
                        )}

                        {entries.map((entry: any, i: number) => (
                          <div key={i} className="text-xs mb-1.5 group">
                            <div className="flex items-center gap-2">
                              <span className="text-amber-400 shrink-0 font-medium">{entry.by_name}</span>
                              <span className="text-[var(--color-muted)] shrink-0">{formatNoteTime(entry.at)}</span>
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteFieldNote(review.id, field.key, i)}
                                  className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition min-h-[28px] min-w-[20px] flex items-center justify-center"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </div>
                            <p className="text-white/80 mt-0.5 break-words">{entry.text}</p>
                          </div>
                        ))}

                        {/* Add entry input */}
                        {isAddingNote && (
                          <div className="mt-1">
                            <textarea
                              value={fieldNoteText}
                              onChange={(e) => setFieldNoteText(e.target.value)}
                              placeholder={`Add ${field.label.toLowerCase()}...`}
                              rows={2}
                              autoFocus
                              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-primary)] resize-none"
                            />
                            <div className="flex gap-2 mt-1 justify-end">
                              <button onClick={() => setFieldNoteTarget(null)}
                                className="text-xs text-[var(--color-muted)] hover:text-white min-h-[44px]">Cancel</button>
                              <button
                                onClick={() => handleAddFieldNote(review.id, field.key)}
                                disabled={!fieldNoteText.trim()}
                                className="text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50 min-h-[44px]"
                              >Save</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {isOwner && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleDeleteReview(review.id)}
                        className="text-xs text-red-400/50 hover:text-red-400 flex items-center gap-1 min-h-[44px]">
                        <Trash2 size={12} /> Delete Review
                      </button>
                    </div>
                  )}
                </div>

                {/* Goals section */}
                <div className="border-t border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Target size={14} /> Goals for the Quarter
                    </h3>
                    {isOwner && (
                      <button
                        onClick={() => { setShowNewGoal(review.id); setGoalTitle(''); setGoalDate('') }}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 min-h-[44px]"
                      >
                        <Plus size={12} /> Add Goal
                      </button>
                    )}
                  </div>

                  {reviewGoals.length === 0 && !showNewGoal && (
                    <p className="text-xs text-[var(--color-muted)] italic">No goals set for this period.</p>
                  )}

                  <div className="space-y-3">
                    {reviewGoals.map(goal => {
                      const notes = Array.isArray(goal.notes) ? goal.notes : []
                      const isEditingThis = editingGoal === goal.id

                      return (
                        <div key={goal.id} className="bg-[var(--color-bg)] rounded-lg border border-gray-700/50 p-3">
                          {isEditingThis ? (
                            <div className="space-y-2">
                              <input
                                value={editGoalTitle}
                                onChange={(e) => setEditGoalTitle(e.target.value)}
                                className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                                autoFocus
                              />
                              <input
                                type="date"
                                value={editGoalDate}
                                onChange={(e) => setEditGoalDate(e.target.value)}
                                className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                              />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingGoal(null)}
                                  className="px-3 py-2 rounded-lg text-xs text-[var(--color-muted)] hover:text-white min-h-[44px]">Cancel</button>
                                <button
                                  onClick={() => handleSaveGoalEdit(goal.id, review.id)}
                                  disabled={!editGoalTitle.trim()}
                                  className="bg-[var(--color-primary)] text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
                                >Save</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${goal.status === 'completed' ? 'line-through text-[var(--color-muted)]' : 'text-white'}`}>
                                    {goal.title}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <select
                                      value={goal.status}
                                      onChange={(e) => handleGoalStatusChange(goal.id, review.id, e.target.value)}
                                      className={`text-[10px] px-2 py-0.5 rounded-full border-0 cursor-pointer ${STATUS_COLORS[goal.status]}`}
                                    >
                                      <option value="not_started">Not Started</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="completed">Completed</option>
                                    </select>
                                    {goal.target_date && (
                                      <span className="text-[10px] text-[var(--color-muted)]">
                                        Due {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => { setNoteTarget(goal.id); setNoteText('') }}
                                    className="text-gray-500 hover:text-blue-400 min-h-[44px] min-w-[28px] flex items-center justify-center"
                                    title="Add note"
                                  >
                                    <MessageSquarePlus size={12} />
                                  </button>
                                  {isOwner && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingGoal(goal.id)
                                          setEditGoalTitle(goal.title)
                                          setEditGoalDate(goal.target_date || '')
                                        }}
                                        className="text-gray-500 hover:text-gray-300 min-h-[44px] min-w-[28px] flex items-center justify-center"
                                        title="Edit goal"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteGoal(goal.id, review.id)}
                                        className="text-gray-500 hover:text-red-400 min-h-[44px] min-w-[28px] flex items-center justify-center"
                                        title="Delete goal"
                                      >
                                        <X size={12} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Goal notes */}
                              {notes.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {notes.map((note, i) => (
                                    <div key={i} className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="text-amber-400 shrink-0">{note.by_name}</span>
                                        <span className="text-[var(--color-muted)] shrink-0">{formatNoteTime(note.at)}</span>
                                      </div>
                                      <p className="text-white/70 mt-0.5 break-words">{note.text}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add note input */}
                              {noteTarget === goal.id && (
                                <div className="mt-2">
                                  <textarea
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    placeholder="Add a note..."
                                    rows={2}
                                    autoFocus
                                    className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--color-primary)] resize-none"
                                  />
                                  <div className="flex gap-2 mt-1 justify-end">
                                    <button onClick={() => setNoteTarget(null)}
                                      className="text-xs text-[var(--color-muted)] hover:text-white min-h-[44px]">Cancel</button>
                                    <button
                                      onClick={() => handleAddGoalNote(goal.id, review.id)}
                                      disabled={!noteText.trim() || savingNote}
                                      className="text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50 min-h-[44px]"
                                    >{savingNote ? 'Saving...' : 'Save Note'}</button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Add goal form */}
                    {showNewGoal === review.id && (
                      <div className="bg-[var(--color-bg)] rounded-lg border border-gray-700/50 p-3 space-y-2">
                        <input
                          value={goalTitle}
                          onChange={(e) => setGoalTitle(e.target.value)}
                          placeholder="Goal title"
                          autoFocus
                          className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                        />
                        <input
                          type="date"
                          value={goalDate}
                          onChange={(e) => setGoalDate(e.target.value)}
                          className="w-full bg-[var(--color-surface)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setShowNewGoal(null)}
                            className="px-3 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white min-h-[44px]">Cancel</button>
                          <button
                            onClick={() => handleCreateGoal(review.id)}
                            disabled={!goalTitle.trim() || savingGoal}
                            className="bg-[var(--color-primary)] text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
                          >{savingGoal ? 'Adding...' : 'Add Goal'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* New Review Modal */}
      {showNewReview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowNewReview(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-4">New Quarterly Review — {teamMemberName}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Period</label>
                <input
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  placeholder="Q4 2026"
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                />
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted)] mt-3">You can add review entries and goals after creating.</p>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowNewReview(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button
                onClick={handleCreateReview}
                disabled={!newPeriod.trim() || savingReview}
                className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition min-h-[44px]"
              >{savingReview ? 'Creating...' : 'Create Review'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
