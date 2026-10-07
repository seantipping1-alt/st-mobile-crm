import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { toast } from '../components/Toast'
import { Plus, Check, ChevronDown, ChevronRight, MessageSquarePlus, RotateCcw, X, Pencil, GripVertical, ExternalLink, Link as LinkIcon } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const CATEGORY_ORDER = ['priority', 'weekly', 'monthly', 'ongoing', 'future']
const CATEGORY_LABELS: Record<string, string> = {
  priority: '🔴 Priority',
  weekly: '📅 Weekly',
  monthly: '📆 Monthly',
  ongoing: '🔄 Ongoing',
  future: '💡 Future',
}
const CATEGORY_COLORS: Record<string, string> = {
  priority: 'border-red-800 bg-red-900/20',
  weekly: 'border-blue-800 bg-blue-900/20',
  monthly: 'border-purple-800 bg-purple-900/20',
  ongoing: 'border-amber-800 bg-amber-900/20',
  future: 'border-gray-700 bg-gray-800/30',
}

function formatNoteTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function shouldAutoReset(task: any): boolean {
  if (task.status !== 'completed' || !task.recurrence || !task.completed_at) return false
  const completed = new Date(task.completed_at)
  const now = new Date()
  if (task.recurrence === 'weekly') {
    const monday = new Date(now)
    monday.setDate(now.getDate() - now.getDay() + 1)
    monday.setHours(0, 0, 0, 0)
    return completed < monday
  }
  if (task.recurrence === 'monthly') {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return completed < firstOfMonth
  }
  return false
}

function getLinkLabel(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('docs.google.com')) {
      if (url.includes('/spreadsheets/')) return 'Google Sheet'
      if (url.includes('/document/')) return 'Google Doc'
      if (url.includes('/presentation/')) return 'Google Slides'
      return 'Google Drive'
    }
    if (u.hostname.includes('drive.google.com')) return 'Google Drive'
    return u.hostname.replace('www.', '')
  } catch {
    return 'Link'
  }
}

// Sortable task item
function SortableTask({ task, isCompleted, catColor, noteTarget, noteText, savingNote,
  onToggleComplete, onSetNoteTarget, onSetNoteText, onAddNote, onDelete, onSetEditTarget }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const notes = Array.isArray(task.notes) ? task.notes : []
  const links = Array.isArray(task.links) ? task.links : []

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg border p-3 transition ${catColor} ${isCompleted ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 p-1 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none min-h-[44px] min-w-[28px] flex items-center justify-center"
        >
          <GripVertical size={14} />
        </button>

        {/* Checkbox */}
        <button
          onClick={() => onToggleComplete(task)}
          className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition min-h-[44px] min-w-[44px] ${
            isCompleted
              ? 'border-green-500 bg-green-500/20 text-green-400'
              : 'border-gray-600 hover:border-gray-400'
          }`}
        >
          {isCompleted && <Check size={12} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium ${isCompleted ? 'line-through text-[var(--color-muted)]' : 'text-white'}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {task.recurrence && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 flex items-center gap-1">
                  <RotateCcw size={9} /> {task.recurrence}
                </span>
              )}
              <button
                onClick={() => onSetEditTarget(task)}
                className="p-1 text-gray-600 hover:text-gray-300 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Pencil size={12} />
              </button>
            </div>
          </div>

          {task.description && (
            <p className="text-xs text-[var(--color-muted)] mt-1">{task.description}</p>
          )}

          {/* Links */}
          {links.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {links.map((link: string, i: number) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/20 px-2 py-1 rounded"
                >
                  <ExternalLink size={10} /> {getLinkLabel(link)}
                </a>
              ))}
            </div>
          )}

          {/* Notes */}
          {notes.length > 0 && (
            <div className="mt-2 space-y-1">
              {notes.map((note: any, i: number) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-[var(--color-muted)] shrink-0">{formatNoteTime(note.at)}</span>
                  <span className="text-amber-400 shrink-0">{note.by_name}</span>
                  <span className="text-white/70">{note.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Add note inline */}
          {noteTarget === task.id && (
            <div className="mt-2">
              <textarea
                value={noteText}
                onChange={(e) => onSetNoteText(e.target.value)}
                placeholder="Add an update..."
                rows={2}
                autoFocus
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none min-h-[44px]"
              />
              <div className="flex gap-2 mt-1.5 justify-end">
                <button onClick={() => { onSetNoteTarget(null); onSetNoteText('') }}
                  className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
                <button onClick={() => onAddNote(task.id)} disabled={!noteText.trim() || savingNote}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-500 disabled:opacity-50 transition min-h-[44px]">
                  {savingNote ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!isCompleted && noteTarget !== task.id && (
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => { onSetNoteTarget(task.id); onSetNoteText('') }}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium min-h-[44px] flex items-center gap-1"
              >
                <MessageSquarePlus size={12} /> Update
              </button>
              <button
                onClick={() => { if (confirm('Delete this task?')) onDelete(task.id) }}
                className="text-xs text-red-400/50 hover:text-red-400 font-medium min-h-[44px] flex items-center gap-1"
              >
                <X size={12} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [noteTarget, setNoteTarget] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCategory, setNewCategory] = useState('ongoing')
  const [newRecurrence, setNewRecurrence] = useState('')
  const [newLinks, setNewLinks] = useState('')
  const [saving, setSaving] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editRecurrence, setEditRecurrence] = useState('')
  const [editLinks, setEditLinks] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const { user } = useAuth()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('loadTasks error', error)
      setLoading(false)
      return
    }

    const toReset = (data || []).filter(shouldAutoReset)
    if (toReset.length > 0) {
      for (const t of toReset) {
        await supabase.from('tasks').update({
          status: 'open',
          completed_at: null,
          completed_by: null,
          last_reset_at: new Date().toISOString(),
        }).eq('id', t.id)
      }
      const { data: refreshed } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order', { ascending: true })
      setTasks(refreshed || [])
    } else {
      setTasks(data || [])
    }
    setLoading(false)
  }

  async function toggleComplete(task: any) {
    if (!user) return
    const newStatus = task.status === 'open' ? 'completed' : 'open'
    const update: any = { status: newStatus }
    if (newStatus === 'completed') {
      update.completed_at = new Date().toISOString()
      update.completed_by = user.id
    } else {
      update.completed_at = null
      update.completed_by = null
    }
    const { error } = await supabase.from('tasks').update(update).eq('id', task.id)
    if (error) {
      toast('Failed to update task')
    } else {
      setTasks(tasks.map(t => t.id === task.id ? { ...t, ...update } : t))
    }
  }

  async function addNote(taskId: string) {
    if (!noteText.trim() || !user) return
    setSavingNote(true)
    const task = tasks.find(t => t.id === taskId)
    const existing = Array.isArray(task?.notes) ? task.notes : []
    const displayName = user.email?.split('@')[0] || 'Unknown'
    const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1)
    const newNote = { text: noteText.trim(), by: user.id, by_name: capitalizedName, at: new Date().toISOString() }
    const updatedNotes = [...existing, newNote]
    const { error } = await supabase.from('tasks').update({ notes: updatedNotes }).eq('id', taskId)
    if (error) {
      toast('Failed to add note')
    } else {
      toast('Note added ✓')
      setTasks(tasks.map(t => t.id === taskId ? { ...t, notes: updatedNotes } : t))
    }
    setSavingNote(false)
    setNoteTarget(null)
    setNoteText('')
  }

  async function addTask() {
    if (!newTitle.trim() || !user) return
    setSaving(true)
    const linksArr = newLinks.split('\n').map(l => l.trim()).filter(Boolean)
    const { data, error } = await supabase.from('tasks').insert({
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      category: newCategory,
      recurrence: newRecurrence || null,
      links: linksArr.length > 0 ? linksArr : [],
      created_by: user.id,
      sort_order: tasks.filter(t => t.category === newCategory).length + 1,
    }).select().single()
    if (error) {
      toast('Failed to add task')
    } else {
      toast('Task added ✓')
      setTasks([...tasks, data])
      setNewTitle(''); setNewDesc(''); setNewCategory('ongoing'); setNewRecurrence(''); setNewLinks('')
      setShowAdd(false)
    }
    setSaving(false)
  }

  async function saveEdit() {
    if (!editTarget || !editTitle.trim()) return
    setEditSaving(true)
    const linksArr = editLinks.split('\n').map(l => l.trim()).filter(Boolean)
    const oldCategory = editTarget.category
    const newCat = editCategory

    const update: any = {
      title: editTitle.trim(),
      description: editDesc.trim() || null,
      category: newCat,
      recurrence: editRecurrence || null,
      links: linksArr.length > 0 ? linksArr : [],
    }

    // If category changed, put it at the end of the new category
    if (oldCategory !== newCat) {
      update.sort_order = tasks.filter(t => t.category === newCat).length + 1
    }

    const { error } = await supabase.from('tasks').update(update).eq('id', editTarget.id)
    if (error) {
      toast('Failed to save changes')
    } else {
      toast('Task updated ✓')
      setTasks(tasks.map(t => t.id === editTarget.id ? { ...t, ...update } : t))
      setEditTarget(null)
    }
    setEditSaving(false)
  }

  async function deleteTask(taskId: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) {
      toast('Failed to delete task')
    } else {
      toast('Task deleted')
      setTasks(tasks.filter(t => t.id !== taskId))
    }
  }

  async function handleDragEnd(event: DragEndEvent, category: string) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const catTasks = tasks.filter(t => t.category === category)
    const oldIndex = catTasks.findIndex(t => t.id === active.id)
    const newIndex = catTasks.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(catTasks, oldIndex, newIndex)

    // Update local state immediately
    const otherTasks = tasks.filter(t => t.category !== category)
    const updatedCatTasks = reordered.map((t, i) => ({ ...t, sort_order: i + 1 }))
    setTasks([...otherTasks, ...updatedCatTasks])

    // Persist new sort orders
    for (const t of updatedCatTasks) {
      await supabase.from('tasks').update({ sort_order: t.sort_order }).eq('id', t.id)
    }
  }

  function openEdit(task: any) {
    setEditTarget(task)
    setEditTitle(task.title)
    setEditDesc(task.description || '')
    setEditCategory(task.category)
    setEditRecurrence(task.recurrence || '')
    setEditLinks((task.links || []).join('\n'))
  }

  const toggleCollapse = (cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl md:max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Tasks</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-primary)] hover:bg-red-700 text-white rounded-lg text-sm font-medium transition min-h-[44px]"
        >
          <Plus size={16} /> Add Task
        </button>
      </div>

      <div className="space-y-6">
        {CATEGORY_ORDER.map(cat => {
          const catTasks = tasks.filter(t => t.category === cat).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          if (catTasks.length === 0) return null
          const isCollapsed = collapsed[cat]
          const openCount = catTasks.filter(t => t.status === 'open').length
          const doneCount = catTasks.filter(t => t.status === 'completed').length

          return (
            <div key={cat}>
              <button
                onClick={() => toggleCollapse(cat)}
                className="flex items-center gap-2 w-full text-left mb-2"
              >
                {isCollapsed ? <ChevronRight size={16} className="text-[var(--color-muted)]" /> : <ChevronDown size={16} className="text-[var(--color-muted)]" />}
                <span className="text-sm font-bold text-white">{CATEGORY_LABELS[cat]}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {openCount > 0 && `${openCount} open`}
                  {openCount > 0 && doneCount > 0 && ' · '}
                  {doneCount > 0 && `${doneCount} done`}
                </span>
              </button>

              {!isCollapsed && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(e, cat)}
                >
                  <SortableContext items={catTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {catTasks.map(task => (
                        <SortableTask
                          key={task.id}
                          task={task}
                          isCompleted={task.status === 'completed'}
                          catColor={CATEGORY_COLORS[cat]}
                          noteTarget={noteTarget}
                          noteText={noteText}
                          savingNote={savingNote}
                          editTarget={editTarget}
                          onToggleComplete={toggleComplete}
                          onSetNoteTarget={setNoteTarget}
                          onSetNoteText={setNoteText}
                          onAddNote={addNote}
                          onDelete={deleteTask}
                          onEdit={saveEdit}
                          onSetEditTarget={openEdit}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )
        })}
      </div>

      {/* Add task modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-4">New Task</h3>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title" autoFocus
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] mb-3 min-h-[44px]" />
            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none mb-3 min-h-[44px]" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Category</label>
                <select value={newCategory} onChange={(e) => {
                  setNewCategory(e.target.value)
                  if (e.target.value === 'weekly') setNewRecurrence('weekly')
                  else if (e.target.value === 'monthly') setNewRecurrence('monthly')
                  else setNewRecurrence('')
                }} className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[44px]">
                  <option value="priority">Priority</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="future">Future</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Repeats</label>
                <select value={newRecurrence} onChange={(e) => setNewRecurrence(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[44px]">
                  <option value="">None</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1"><LinkIcon size={10} /> Links (one per line)</label>
              <textarea value={newLinks} onChange={(e) => setNewLinks(e.target.value)} placeholder="https://docs.google.com/..." rows={2}
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none min-h-[44px]" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={addTask} disabled={!newTitle.trim() || saving}
                className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition min-h-[44px]">
                {saving ? 'Adding...' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit task modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-[var(--color-surface)] rounded-lg p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-4">Edit Task</h3>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Task title" autoFocus
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] mb-3 min-h-[44px]" />
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none mb-3 min-h-[44px]" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Category</label>
                <select value={editCategory} onChange={(e) => {
                  setEditCategory(e.target.value)
                  if (e.target.value === 'weekly') setEditRecurrence('weekly')
                  else if (e.target.value === 'monthly') setEditRecurrence('monthly')
                }} className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[44px]">
                  <option value="priority">Priority</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="future">Future</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] mb-1 block">Repeats</label>
                <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white min-h-[44px]">
                  <option value="">None</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1"><LinkIcon size={10} /> Links (one per line)</label>
              <textarea value={editLinks} onChange={(e) => setEditLinks(e.target.value)} placeholder="https://docs.google.com/..." rows={2}
                className="w-full bg-[var(--color-bg)] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] resize-none min-h-[44px]" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2.5 rounded-lg text-sm text-[var(--color-muted)] hover:text-white transition min-h-[44px]">Cancel</button>
              <button onClick={saveEdit} disabled={!editTitle.trim() || editSaving}
                className="bg-[var(--color-primary)] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition min-h-[44px]">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}