import { useState, useEffect } from 'react'
import { toast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, MessageSquarePlus, X, Target } from 'lucide-react'
import {
  getReviewsForMember, createReview, updateReview, deleteReview,
  getGoalsForReview, createGoal, updateGoal, addGoalNote, deleteGoal,
  type EmployeeReview, type EmployeeGoal,
} from '../lib/db'

const OWNER_ID = '095969b8-e5da-45a1-a26e-483fac0cc94c'

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-600 text-gray-200',
  in_progress: 'bg-amber-600/30 text-amber-300',
  completed: 'bg-green-600/30 text-green-300',
}

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

  const [reviews, setReviews] = useState<EmployeeReview[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedReview, setExpandedReview] = useState<string | null>(null)
  const [goals, setGoals] = useState<Record<string, EmployeeGoal[]>>({})

  // New review form
  const [showNewReview, setShowNewReview] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    period: getCurrentPeriod(),
    review_date: new Date().toISOString().split('T')[0],
    employee_goal: '',
    most_valuable_skill: '',
    skill_needs_work: '',
    biggest_issue: '',
    whats_blocking: '',
    what_sean_do_differently: '',
  })
  const [savingReview, setSavingReview] = useState(false)

  // Edit review
  const [editingReview, setEditingReview] = useState<string | null>(null)
  const [editReviewForm, setEditReviewForm] = useState<any>({})

  // New goal form
  const [showNewGoal, setShowNewGoal] = useState<string | null>(null) // review id
  const [goalTitle, setGoalTitle] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [savingGoal, setSavingGoal] = useState(false)

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
      const data = await getReviewsForMember(teamMemberId)
      setReviews(data)
      // Auto-expand the most recent
      if (data.length > 0) {
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
      const review = await createReview({
        team_member_id: teamMemberId,
        period: reviewForm.period,
        review_date: reviewForm.review_date ? new Date(reviewForm.review_date).toISOString() : null,
        employee_goal: reviewForm.employee_goal || null,
        most_valuable_skill: reviewForm.most_valuable_skill || null,
        skill_needs_work: reviewForm.skill_needs_work || null,
        biggest_issue: reviewForm.biggest_issue || null,
        whats_blocking: reviewForm.whats_blocking || null,
        what_sean_do_differently: reviewForm.what_sean_do_differently || null,
        created_by: user?.id || null,
      })
      setReviews([review, ...reviews])
      setExpandedReview(review.id)
      setGoals(prev => ({ ...prev, [review.id]: [] }))
      setShowNewReview(false)
      setReviewForm({
        period: getCurrentPeriod(),
        review_date: new Date().toISOString().split('T')[0],
        employee_goal: '', most_valuable_skill: '', skill_needs_work: '',
        biggest_issue: '', whats_blocking: '', what_sean_do_differently: '',
      })
      toast('Review created ✓')
    } catch (err) {
      console.error(err)
      toast('Failed to create review')
    }
    setSavingReview(false)
  }

  async function handleUpdateReview(id: string) {
    try {
      const updated = await updateReview(id, editReviewForm)
      setReviews(reviews.map(r => r.id === id ? updated : r))
      setEditingReview(null)
      toast('Review updated ✓')
    } catch (err) {
      console.error(err)
      toast('Failed to update review')
    }
  }

  async function handleDeleteReview(id: string) {
    if (!confirm('Delete this review and all its goals? This cannot be undone.')) return
    try {
      await deleteReview(id)
      setReviews(reviews.filter(r => r.id !== id))
      if (expandedReview === id) setExpandedReview(null)
      toast('Review deleted')
    } catch (err) {
      console.error(err)
      toast('Failed to delete review')
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
      {/* Header */}
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
        const isEditing = editingReview === review.id
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

            {/* Expanded review content */}
            {isExpanded && (
              <div className="border-t border-gray-700 p-4 space-y-4">
                {/* Review fields */}
                {isEditing ? (
                  <div className="space-y-3">
                    {[
                      { key: 'employee_goal', label: 'Employee Goal for the Quarter' },
                      { key: 'most_valuable_skill', label: 'Most Valuable Skill' },
                      { key: 'skill_needs_work', label: 'Skill That Needs the Most Work' },
                      { key: 'biggest_issue', label: 'Biggest Issue' },
                      { key: 'whats_blocking', label: "What's Blocking You From Doing More" },
                      { key: 'what_sean_do_differently', label: 'What Can Sean Do Differently' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="text-xs text-[var(--color-muted)] mb-1 block">{field.label}</label>
                        <textarea
                          value={editReviewForm[field.key] || ''}
                          onChange={(e) => setEditReviewForm({ ...editReviewForm, [field.key]: e.target.value })}
                          rows={2}
                          className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none"
                        />
                      </div>
                    ))}
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setEditingReview(null)}
                        className="px-4 py-2 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
                      <button onClick={() => handleUpdateReview(review.id)}
                        className="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition min-h-[44px]">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[
                      { key: 'employee_goal', label: 'Employee Goal for the Quarter' },
                      { key: 'most_valuable_skill', label: 'Most Valuable Skill' },
                      { key: 'skill_needs_work', label: 'Skill That Needs the Most Work' },
                      { key: 'biggest_issue', label: 'Biggest Issue' },
                      { key: 'whats_blocking', label: "What's Blocking You From Doing More" },
                      { key: 'what_sean_do_differently', label: 'What Can Sean Do Differently' },
                    ].map(field => {
                      const val = (review as any)[field.key]
                      if (!val) return null
                      return (
                        <div key={field.key}>
                          <p className="text-xs text-[var(--color-muted)] font-medium mb-0.5">{field.label}</p>
                          <p className="text-sm text-white/80">{val}</p>
                        </div>
                      )
                    })}

                    {/* Empty state for unfilled review */}
                    {!review.employee_goal && !review.most_valuable_skill && !review.skill_needs_work &&
                     !review.biggest_issue && !review.whats_blocking && !review.what_sean_do_differently && (
                      <p className="text-sm text-[var(--color-muted)] italic">No review notes yet. Click edit to fill in.</p>
                    )}

                    {isOwner && (
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => {
                          setEditingReview(review.id)
                          setEditReviewForm({
                            employee_goal: review.employee_goal || '',
                            most_valuable_skill: review.most_valuable_skill || '',
                            skill_needs_work: review.skill_needs_work || '',
                            biggest_issue: review.biggest_issue || '',
                            whats_blocking: review.whats_blocking || '',
                            what_sean_do_differently: review.what_sean_do_differently || '',
                          })
                        }}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 min-h-[44px]">
                          <Pencil size={12} /> Edit Review
                        </button>
                        <button onClick={() => handleDeleteReview(review.id)}
                          className="text-xs text-red-400/50 hover:text-red-400 flex items-center gap-1 min-h-[44px]">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Goals section */}
                <div className="border-t border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Target size={14} /> Goals
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
                      return (
                        <div key={goal.id} className="bg-[var(--color-bg)] rounded-lg border border-gray-700/50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${goal.status === 'completed' ? 'line-through text-[var(--color-muted)]' : 'text-white'}`}>
                                {goal.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <select
                                  value={goal.status}
                                  onChange={(e) => handleGoalStatusChange(goal.id, review.id, e.target.value)}
                                  disabled={!isOwner && goal.status === 'completed'}
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
                              >
                                <MessageSquarePlus size={12} />
                              </button>
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteGoal(goal.id, review.id)}
                                  className="text-gray-500 hover:text-red-400 min-h-[44px] min-w-[28px] flex items-center justify-center"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Goal notes */}
                          {notes.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {notes.map((note, i) => (
                                <div key={i} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--color-muted)] shrink-0">{formatNoteTime(note.at)}</span>
                                    <span className="text-amber-400 shrink-0">{note.by_name}</span>
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
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-4">New Quarterly Review — {teamMemberName}</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Period</label>
                <input
                  value={reviewForm.period}
                  onChange={(e) => setReviewForm({ ...reviewForm, period: e.target.value })}
                  placeholder="Q4 2026"
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Date</label>
                <input
                  type="date"
                  value={reviewForm.review_date}
                  onChange={(e) => setReviewForm({ ...reviewForm, review_date: e.target.value })}
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] min-h-[44px]"
                />
              </div>
            </div>

            {[
              { key: 'employee_goal', label: 'Employee Goal for the Quarter' },
              { key: 'most_valuable_skill', label: 'Most Valuable Skill' },
              { key: 'skill_needs_work', label: 'Skill That Needs the Most Work' },
              { key: 'biggest_issue', label: 'Biggest Issue' },
              { key: 'whats_blocking', label: "What's Blocking You From Doing More" },
              { key: 'what_sean_do_differently', label: 'What Can Sean Do Differently' },
            ].map(field => (
              <div key={field.key} className="mb-3">
                <label className="text-xs text-[var(--color-muted)] mb-1 block">{field.label}</label>
                <textarea
                  value={(reviewForm as any)[field.key]}
                  onChange={(e) => setReviewForm({ ...reviewForm, [field.key]: e.target.value })}
                  rows={2}
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none"
                />
              </div>
            ))}

            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowNewReview(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button
                onClick={handleCreateReview}
                disabled={!reviewForm.period.trim() || savingReview}
                className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition min-h-[44px]"
              >{savingReview ? 'Creating...' : 'Create Review'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
