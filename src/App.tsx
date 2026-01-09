import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import {
  StorageRoot,
  ViewMode,
  HistoryAggregation,
  ProjectSnapshot,
  Task,
  Week,
  ExportData,
  ProjectStatus,
} from "./types";
import {
  loadStorage,
  saveStorage,
  checkWeekChange,
  createNewWeek,
  addProject,
  deleteProject,
  updateProjectTitle,
  updateProjectStatus,
  addTask,
  updateTask,
  deleteTask,
  countUrgentTasks,
  getProjectTitle,
  ensureProjectInWeek,
  reorderTasks,
  reorderProjects,
  updateFocusViewOrder,
  addTaskToFocusViewOrder,
  removeTaskFromFocusViewOrder,
} from "./storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Download,
  Upload,
  Edit3,
  X,
  Check,
  AlertTriangle,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STATUS_OPTIONS: ProjectStatus[] = ["to do", "in progress", "blocked", "done"];

const STATUS_COLORS: Record<ProjectStatus, string> = {
  "to do": "bg-gray-200 text-gray-700",
  "in progress": "bg-blue-200 text-blue-700",
  blocked: "bg-red-200 text-red-700",
  done: "bg-green-200 text-green-700",
};

// Sortable Task Component
function SortableTask({
  task,
  projectId,
  weekId,
  canEdit,
  isEditing,
  editingTaskText,
  setEditingTaskText,
  handleSaveTaskText,
  setEditingTaskId,
  handleToggleTaskComplete,
  handleToggleTaskUrgent,
  handleDeleteTask,
}: {
  task: Task;
  projectId: string;
  weekId: string;
  canEdit: boolean;
  isEditing: boolean;
  editingTaskText: string;
  setEditingTaskText: (text: string) => void;
  handleSaveTaskText: () => void;
  setEditingTaskId: (id: string | null) => void;
  handleToggleTaskComplete: (weekId: string, projectId: string, taskId: string, completed: boolean) => void;
  handleToggleTaskUrgent: (weekId: string, projectId: string, taskId: string, urgent: boolean) => void;
  handleDeleteTask: (weekId: string, projectId: string, taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-solarized-base2 group ${
        task.completed ? "opacity-60" : ""
      }`}
    >
      {canEdit && (
        <div {...attributes} {...listeners} className="cursor-grab">
          <GripVertical className="h-3 w-3 text-solarized-base1" />
        </div>
      )}
      <Checkbox
        checked={task.completed}
        onCheckedChange={(checked) =>
          canEdit && handleToggleTaskComplete(weekId, projectId, task.id, checked as boolean)
        }
        disabled={!canEdit}
        className="border-solarized-base1"
      />
      {isEditing ? (
        <Input
          value={editingTaskText}
          onChange={(e) => setEditingTaskText(e.target.value)}
          onBlur={handleSaveTaskText}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveTaskText();
            if (e.key === "Escape") setEditingTaskId(null);
          }}
          autoFocus
          className="flex-1 h-7 font-mono text-sm bg-solarized-base3 border-solarized-base1"
        />
      ) : (
        <span
          className={`flex-1 text-sm cursor-pointer ${
            task.completed ? "line-through text-solarized-base1" : ""
          } ${task.urgent ? "font-bold text-solarized-red" : ""}`}
          onClick={() => {
            if (canEdit) {
              setEditingTaskId(task.id);
              setEditingTaskText(task.text);
            }
          }}
        >
          {renderTaskTextWithLinks(task.text)}
        </span>
      )}
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${task.urgent ? "text-solarized-red" : "text-solarized-base1"}`}
            onClick={() => handleToggleTaskUrgent(weekId, projectId, task.id, !task.urgent)}
            title={task.urgent ? "Remove urgent" : "Mark urgent"}
          >
            <AlertTriangle className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-solarized-base1 hover:text-solarized-red"
            onClick={() => handleDeleteTask(weekId, projectId, task.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Sortable Project Component for Sidebar
function SortableProject({
  project,
  snapshot,
  uncheckedCount,
  urgentCount,
  isSelected,
  onSelect,
}: {
  project: { id: string; title: string };
  snapshot: ProjectSnapshot | undefined;
  uncheckedCount: number;
  urgentCount: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 px-2 py-2 rounded cursor-pointer mb-1 ${
        isSelected
          ? "bg-solarized-cyan text-solarized-base3 font-semibold"
          : "hover:bg-solarized-base3 text-solarized-base00"
      }`}
      onClick={onSelect}
    >
      <div {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="h-3 w-3 text-solarized-base1" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium break-words">{project.title}</div>
        {snapshot && (
          <div
            className={`text-xs mt-0.5 ${STATUS_COLORS[snapshot.status]} px-1 rounded inline-block`}
          >
            {snapshot.status}
          </div>
        )}
      </div>
      {uncheckedCount > 0 && (
        <span className="text-xs bg-solarized-base1 text-solarized-base3 px-1.5 py-0.5 rounded-full ml-2 flex items-center gap-1">
          {uncheckedCount}
          {urgentCount > 0 && (
            <>
              <span className="text-solarized-base3">({urgentCount}</span>
              <AlertTriangle className="h-2.5 w-2.5 text-solarized-orange" />
              <span className="text-solarized-base3">)</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

// Sortable Focus Task Component for Focus View
function SortableFocusTask({
  task,
  projectId,
  projectTitle,
  weekId,
  canEdit,
  handleToggleTaskComplete,
  handleToggleTaskUrgent,
}: {
  task: Task;
  projectId: string;
  projectTitle: string;
  weekId: string;
  canEdit: boolean;
  handleToggleTaskComplete: (weekId: string, projectId: string, taskId: string, completed: boolean) => void;
  handleToggleTaskUrgent: (weekId: string, projectId: string, taskId: string, urgent: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border border-solarized-base2 rounded-lg bg-solarized-base3"
    >
      {canEdit && (
        <div {...attributes} {...listeners} className="cursor-grab">
          <GripVertical className="h-4 w-4 text-solarized-base1" />
        </div>
      )}
      <Checkbox
        checked={task.completed}
        onCheckedChange={(checked) =>
          canEdit &&
          handleToggleTaskComplete(weekId, projectId, task.id, checked as boolean)
        }
        disabled={!canEdit}
        className="border-solarized-red"
      />
      <div className="flex-1">
        <span className="font-bold text-solarized-red">{renderTaskTextWithLinks(task.text)}</span>
        <span className="text-xs text-solarized-base1 ml-2">({projectTitle})</span>
      </div>
      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-solarized-base1"
          onClick={() =>
            handleToggleTaskUrgent(weekId, projectId, task.id, false)
          }
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function getQuarter(dateStr: string): number {
  const month = new Date(dateStr).getMonth();
  return Math.floor(month / 3) + 1;
}

// Helper to clean task text: trim whitespace and trailing punctuation
function cleanTaskText(text: string): string {
  return text.trim().replace(/[.,;:!?]+$/, "").trim();
}

// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// Helper to render task text with clickable links
function renderTaskTextWithLinks(text: string): React.ReactNode {
  const parts = text.split(URL_REGEX);
  
  if (parts.length === 1) {
    return text;
  }
  
  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      // Reset regex lastIndex since we're using global flag
      URL_REGEX.lastIndex = 0;
      return (
        <>
          <span>{'('}</span>
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-solarized-blue hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          link
          </a>
          <span>{')'}</span>
        </>
      );
    }
    return part;
  });
}

function App() {
  const [data, setData] = useState<StorageRoot | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [historyAggregation, setHistoryAggregation] = useState<HistoryAggregation>("week");
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [showNewWeekDialog, setShowNewWeekDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState("");
  const [newTaskText, setNewTaskText] = useState<Record<string, string>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const stored = loadStorage();
    setData(stored);
    setSelectedWeekId(stored.activeWeekId);

    const allProjectIds = stored.projectsIndex.map((p) => p.id);
    setExpandedProjects(new Set(allProjectIds));

    if (checkWeekChange(stored)) {
      setShowNewWeekDialog(true);
    }
  }, []);

  useEffect(() => {
    if (snackbar) {
      const timer = setTimeout(() => setSnackbar(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [snackbar]);

  const persist = useCallback((newData: StorageRoot) => {
    setData(newData);
    saveStorage(newData);
  }, []);

  const handleStartNewWeek = useCallback(() => {
    if (!data) return;
    const newData = createNewWeek(data);
    persist(newData);
    setSelectedWeekId(newData.activeWeekId);
    setShowNewWeekDialog(false);
    setEditMode(false);
  }, [data, persist]);

  const handleDismissNewWeek = useCallback(() => {
    setShowNewWeekDialog(false);
  }, []);

  const handleAddProject = useCallback(() => {
    if (!data) return;
    const title = prompt("Enter project name:");
    if (!title?.trim()) return;
    const newData = addProject(data, title.trim());
    persist(newData);
  }, [data, persist]);

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      if (!data) return;
      if (projectId === "bau") {
        setSnackbar("Cannot delete BAU project");
        return;
      }
      if (!confirm("Delete this project and all its tasks?")) return;
      const newData = deleteProject(data, projectId);
      persist(newData);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }
    },
    [data, persist, selectedProjectId]
  );

  const handleSaveProjectTitle = useCallback(() => {
    if (!data || !editingProjectId) return;
    if (!editingProjectTitle.trim()) {
      setEditingProjectId(null);
      return;
    }
    const newData = updateProjectTitle(data, editingProjectId, editingProjectTitle.trim());
    persist(newData);
    setEditingProjectId(null);
  }, [data, editingProjectId, editingProjectTitle, persist]);

  const handleUpdateProjectStatus = useCallback(
    (weekId: string, projectId: string, status: ProjectStatus) => {
      if (!data) return;
      const newData = updateProjectStatus(data, weekId, projectId, status);
      persist(newData);
    },
    [data, persist]
  );

  const handleAddTask = useCallback(
    (weekId: string, projectId: string) => {
      if (!data) return;
      const text = newTaskText[projectId];
      const cleanedText = cleanTaskText(text || "");
      if (!cleanedText) return;

      let newData = ensureProjectInWeek(data, weekId, projectId);
      newData = addTask(newData, weekId, projectId, cleanedText, false);

      persist(newData);
      setNewTaskText((prev) => ({ ...prev, [projectId]: "" }));
    },
    [data, newTaskText, persist]
  );

  const handleToggleTaskComplete = useCallback(
    (weekId: string, projectId: string, taskId: string, completed: boolean) => {
      if (!data) return;
      // When marking as done, also remove urgency
      const updates = completed ? { completed, urgent: false } : { completed };
      const newData = updateTask(data, weekId, projectId, taskId, updates);
      persist(newData);
    },
    [data, persist]
  );

  const handleToggleTaskUrgent = useCallback(
    (weekId: string, projectId: string, taskId: string, urgent: boolean) => {
      if (!data) return;

      if (urgent) {
        const week = data.weeks.find((w) => w.id === weekId);
        if (week && countUrgentTasks(week) >= 4) {
          setSnackbar("Warning: You have more than 4 urgent tasks this week");
        }
      }

      let newData = updateTask(data, weekId, projectId, taskId, { urgent });
      
      // Update focus view order when toggling urgency
      if (urgent) {
        // Add to bottom of focus view order when marking as urgent
        newData = addTaskToFocusViewOrder(newData, taskId);
      } else {
        // Remove from focus view order when unmarking as urgent
        newData = removeTaskFromFocusViewOrder(newData, taskId);
      }
      
      persist(newData);
    },
    [data, persist]
  );

  const handleSaveTaskText = useCallback(() => {
    if (!data || !editingTaskId || !selectedWeekId) return;

    const week = data.weeks.find((w) => w.id === selectedWeekId);
    if (!week) return;

    for (const project of week.projects) {
      const task = project.tasks.find((t) => t.id === editingTaskId);
      if (task) {
        const cleanedText = cleanTaskText(editingTaskText);
        const newData = updateTask(data, selectedWeekId, project.projectId, editingTaskId, {
          text: cleanedText || task.text,
        });
        persist(newData);
        break;
      }
    }
    setEditingTaskId(null);
  }, [data, editingTaskId, editingTaskText, selectedWeekId, persist]);

  const handleDeleteTask = useCallback(
    (weekId: string, projectId: string, taskId: string) => {
      if (!data) return;
      const newData = deleteTask(data, weekId, projectId, taskId);
      persist(newData);
    },
    [data, persist]
  );

  const handleExport = useCallback(() => {
    if (!data) return;
    const exportData: ExportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      data: {
        weeks: data.weeks,
        projectsIndex: data.projectsIndex,
        activeWeekId: data.activeWeekId,
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "weekly-task-assistant.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const handleImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !data) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string) as ExportData;

          if (!imported.version || !imported.data) {
            setSnackbar("Invalid file format");
            return;
          }

          if (importMode === "replace") {
            const newData: StorageRoot = {
              weeks: imported.data.weeks,
              projectsIndex: imported.data.projectsIndex,
              activeWeekId: imported.data.activeWeekId,
            };
            persist(newData);
            setSelectedWeekId(newData.activeWeekId);
          } else {
            const existingProjectIds = new Set(data.projectsIndex.map((p) => p.id));

            const newProjects = imported.data.projectsIndex.filter(
              (p) => !existingProjectIds.has(p.id)
            );

            const mergedWeeks = [...data.weeks];
            for (const importedWeek of imported.data.weeks) {
              const existingIdx = mergedWeeks.findIndex((w) => w.id === importedWeek.id);
              if (existingIdx >= 0) {
                const existing = mergedWeeks[existingIdx];
                const mergedProjects = [...existing.projects];

                for (const importedProject of importedWeek.projects) {
                  const existingProjIdx = mergedProjects.findIndex(
                    (p) => p.projectId === importedProject.projectId
                  );
                  if (existingProjIdx >= 0) {
                    const existingProj = mergedProjects[existingProjIdx];
                    const existingTaskIds = new Set(existingProj.tasks.map((t) => t.id));
                    const newTasks = importedProject.tasks.filter(
                      (t) => !existingTaskIds.has(t.id)
                    );
                    mergedProjects[existingProjIdx] = {
                      ...existingProj,
                      tasks: [...existingProj.tasks, ...newTasks],
                    };
                  } else {
                    mergedProjects.push(importedProject);
                  }
                }

                mergedWeeks[existingIdx] = { ...existing, projects: mergedProjects };
              } else {
                mergedWeeks.push(importedWeek);
              }
            }

            const newData: StorageRoot = {
              weeks: mergedWeeks,
              projectsIndex: [...data.projectsIndex, ...newProjects],
              activeWeekId: data.activeWeekId,
            };
            persist(newData);
          }

          setShowImportDialog(false);
          setSnackbar("Import successful");
        } catch {
          setSnackbar("Failed to parse import file");
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [data, importMode, persist]
  );

  const toggleProjectExpanded = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    if (!data) return;
    const allProjectIds = data.projectsIndex.map((p) => p.id);
    setExpandedProjects(new Set(allProjectIds));
  }, [data]);

  const handleCollapseAll = useCallback(() => {
    setExpandedProjects(new Set());
  }, []);

  const handleTaskDragEnd = useCallback(
    (event: DragEndEvent, projectId: string, weekId: string) => {
      if (!data) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const week = data.weeks.find((w) => w.id === weekId);
      if (!week) return;

      const snapshot = week.projects.find((p) => p.projectId === projectId);
      if (!snapshot) return;

      const oldIndex = snapshot.tasks.findIndex((t) => t.id === active.id);
      const overIndex = snapshot.tasks.findIndex((t) => t.id === over.id);

      if (oldIndex === -1 || overIndex === -1) return;

      const newTaskIds = arrayMove(
        snapshot.tasks.map((t) => t.id),
        oldIndex,
        overIndex
      );

      const newData = reorderTasks(data, weekId, projectId, newTaskIds);
      persist(newData);
    },
    [data, persist]
  );

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!data) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // Don't allow moving BAU
      if (active.id === "bau") return;

      // Get projects excluding BAU (BAU is always at the bottom)
      const projectsWithoutBAU = data.projectsIndex.filter((p) => p.id !== "bau");
      const bauProject = data.projectsIndex.find((p) => p.id === "bau");

      const oldIndex = projectsWithoutBAU.findIndex((p) => p.id === active.id);
      const overIndex = projectsWithoutBAU.findIndex((p) => p.id === over.id);

      if (oldIndex === -1 || overIndex === -1) return;

      const reorderedWithoutBAU = arrayMove(projectsWithoutBAU, oldIndex, overIndex);
      const newProjectIds = bauProject
        ? [...reorderedWithoutBAU.map((p) => p.id), bauProject.id]
        : reorderedWithoutBAU.map((p) => p.id);

      const newData = reorderProjects(data, newProjectIds);
      persist(newData);
    },
    [data, persist]
  );

  const handleFocusViewDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!data) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const currentOrder = data.focusViewOrder || [];
      const oldIndex = currentOrder.indexOf(active.id as string);
      const overIndex = currentOrder.indexOf(over.id as string);

      if (oldIndex === -1 || overIndex === -1) return;

      const newOrder = arrayMove(currentOrder, oldIndex, overIndex);
      const newData = updateFocusViewOrder(data, newOrder);
      persist(newData);
    },
    [data, persist]
  );

  // Sidebar resize handlers
  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-solarized-base3 font-mono">
        Loading...
      </div>
    );
  }

  const activeWeek = data.weeks.find((w) => w.id === data.activeWeekId);
  const selectedWeek = data.weeks.find((w) => w.id === selectedWeekId);
  const isViewingActiveWeek = selectedWeekId === data.activeWeekId;
  const canEdit = isViewingActiveWeek || editMode;

  const filteredProjects = selectedProjectId
    ? data.projectsIndex.filter((p) => p.id === selectedProjectId)
    : data.projectsIndex;

  const getProjectSnapshot = (weekId: string, projectId: string): ProjectSnapshot | undefined => {
    const week = data.weeks.find((w) => w.id === weekId);
    return week?.projects.find((p) => p.projectId === projectId);
  };

  const getUncheckedCount = (projectId: string): number => {
    if (!activeWeek) return 0;
    const snapshot = activeWeek.projects.find((p) => p.projectId === projectId);
    return snapshot?.tasks.filter((t) => !t.completed).length || 0;
  };

  const getUrgentCount = (projectId: string): number => {
    if (!activeWeek) return 0;
    const snapshot = activeWeek.projects.find((p) => p.projectId === projectId);
    return snapshot?.tasks.filter((t) => t.urgent && !t.completed).length || 0;
  };

  const renderProjectCard = (projectId: string, weekId: string) => {
    const project = data.projectsIndex.find((p) => p.id === projectId);
    if (!project) return null;

    const snapshot = getProjectSnapshot(weekId, projectId);
    const tasks = snapshot?.tasks || [];
    const isExpanded = expandedProjects.has(projectId);
    const isEditingTitle = editingProjectId === projectId;

    // Sort tasks: uncompleted first, completed last
    const sortedTasks = [...tasks].sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    });

    // Calculate task counts
    const uncheckedCount = tasks.filter((t) => !t.completed).length;
    const urgentCount = tasks.filter((t) => t.urgent && !t.completed).length;

    return (
      <Collapsible
        key={projectId}
        open={isExpanded}
        onOpenChange={() => toggleProjectExpanded(projectId)}
        className="border border-solarized-base2 rounded-lg mb-3 bg-solarized-base3"
      >
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-solarized-base2 rounded-t-lg">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-solarized-base1" />
            ) : (
              <ChevronRight className="h-4 w-4 text-solarized-base1" />
            )}
            {isEditingTitle ? (
              <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  value={editingProjectTitle}
                  onChange={(e) => setEditingProjectTitle(e.target.value)}
                  className="h-7 font-mono text-sm bg-solarized-base3 border-solarized-base1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveProjectTitle();
                    if (e.key === "Escape") setEditingProjectId(null);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleSaveProjectTitle}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setEditingProjectId(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <span className="font-semibold text-solarized-base01">{project.title}</span>
                {uncheckedCount > 0 && (
                  <span className="text-xs text-solarized-base1 flex items-center gap-1">
                    {uncheckedCount}
                    {urgentCount > 0 && (
                      <span className="text-solarized-red flex items-center">
                        ({urgentCount} <AlertTriangle className="h-3 w-3 ml-0.5" />)
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
            {snapshot && (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={snapshot.status}
                  onValueChange={(value) =>
                    canEdit && handleUpdateProjectStatus(weekId, projectId, value as ProjectStatus)
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger
                    className={`h-7 w-28 text-xs font-mono ${STATUS_COLORS[snapshot.status]}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status} className="font-mono text-xs">
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canEdit && !isEditingTitle && projectId !== "bau" && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-solarized-base1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProjectId(projectId);
                        setEditingProjectTitle(project.title);
                      }}
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-solarized-base1 hover:text-solarized-red"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(projectId);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t border-solarized-base2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleTaskDragEnd(event, projectId, weekId)}
            >
              <SortableContext
                items={sortedTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedTasks.map((task) => (
                  <SortableTask
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    weekId={weekId}
                    canEdit={canEdit}
                    isEditing={editingTaskId === task.id}
                    editingTaskText={editingTaskText}
                    setEditingTaskText={setEditingTaskText}
                    handleSaveTaskText={handleSaveTaskText}
                    setEditingTaskId={setEditingTaskId}
                    handleToggleTaskComplete={handleToggleTaskComplete}
                    handleToggleTaskUrgent={handleToggleTaskUrgent}
                    handleDeleteTask={handleDeleteTask}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {canEdit && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  placeholder="Add task..."
                  value={newTaskText[projectId] || ""}
                  onChange={(e) =>
                    setNewTaskText((prev) => ({ ...prev, [projectId]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTask(weekId, projectId);
                  }}
                  className="flex-1 h-8 font-mono text-sm bg-solarized-base3 border-solarized-base1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-solarized-base1"
                  onClick={() => handleAddTask(weekId, projectId)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderWeeklyView = () => {
    if (!selectedWeek) return null;

    const weekNum = getWeekNumber(selectedWeek.startDate);

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-solarized-base01">
                Week #{weekNum}
              </h2>
              <span
                className="text-sm text-solarized-blue cursor-pointer hover:underline"
                onClick={expandedProjects.size === data.projectsIndex.length ? handleCollapseAll : handleExpandAll}
              >
                {expandedProjects.size === data.projectsIndex.length ? "collapse all" : "expand all"}
              </span>
            </div>
            <p className="text-sm text-solarized-base1">
              {formatDate(selectedWeek.startDate)} - {formatDate(selectedWeek.endDate)}
            </p>
          </div>
          {!isViewingActiveWeek && (
            <div className="flex items-center gap-2">
              {editMode && (
                <span className="text-xs text-solarized-orange font-semibold px-2 py-1 bg-solarized-base2 rounded">
                  EDIT MODE
                </span>
              )}
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={() => setEditMode(!editMode)}
                className="font-mono text-xs"
              >
                {editMode ? "Exit Edit Mode" : "Enable Edit Mode"}
              </Button>
            </div>
          )}
        </div>
        {filteredProjects.map((project) => renderProjectCard(project.id, selectedWeek.id))}
      </div>
    );
  };

  const renderFocusView = () => {
    if (!selectedWeek) return null;

    const urgentTasksMap: Map<string, { task: Task; projectId: string; projectTitle: string }> = new Map();

    for (const snapshot of selectedWeek.projects) {
      const project = data.projectsIndex.find((p) => p.id === snapshot.projectId);
      for (const task of snapshot.tasks) {
        if (task.urgent && !task.completed) {
          urgentTasksMap.set(task.id, {
            task,
            projectId: snapshot.projectId,
            projectTitle: project?.title || "Unknown",
          });
        }
      }
    }

    const focusViewOrder = data.focusViewOrder || [];
    const orderedTaskIds = focusViewOrder.filter((id) => urgentTasksMap.has(id));
    const unorderedTaskIds = Array.from(urgentTasksMap.keys()).filter(
      (id) => !orderedTaskIds.includes(id)
    );
    const allTaskIds = [...orderedTaskIds, ...unorderedTaskIds];

    const sortedUrgentTasks = allTaskIds
      .map((id) => urgentTasksMap.get(id))
      .filter((item): item is { task: Task; projectId: string; projectTitle: string } => item !== undefined);

    return (
      <div>
        <h2 className="text-lg font-semibold text-solarized-base01 mb-4">
          Focus Mode - Urgent Tasks ({sortedUrgentTasks.length})
        </h2>
        {sortedUrgentTasks.length === 0 ? (
          <p className="text-solarized-base1 text-sm">No urgent unchecked tasks.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleFocusViewDragEnd}
          >
            <SortableContext
              items={allTaskIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sortedUrgentTasks.map(({ task, projectId, projectTitle }) => (
                  <SortableFocusTask
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    projectTitle={projectTitle}
                    weekId={selectedWeek.id}
                    canEdit={canEdit}
                    handleToggleTaskComplete={handleToggleTaskComplete}
                    handleToggleTaskUrgent={handleToggleTaskUrgent}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    );
  };

  const renderHistoryView = () => {
    const archivedWeeks = data.weeks.filter((w) => w.archived).sort((a, b) => 
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    type AggregatedData = {
      label: string;
      weeks: Week[];
      projectStats: Record<string, { completed: number; total: number }>;
    };

    const aggregateData = (): AggregatedData[] => {
      const groups: Record<string, AggregatedData> = {};

      for (const week of archivedWeeks) {
        let key: string;
        let label: string;
        const year = new Date(week.startDate).getFullYear();

        switch (historyAggregation) {
          case "week":
            key = week.id;
            label = `Week ${getWeekNumber(week.startDate)}, ${year}`;
            break;
          case "month": {
            const month = new Date(week.startDate).getMonth();
            key = `${year}-${month}`;
            label = new Date(week.startDate).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            });
            break;
          }
          case "quarter": {
            const q = getQuarter(week.startDate);
            key = `${year}-Q${q}`;
            label = `Q${q} ${year}`;
            break;
          }
          case "year":
            key = `${year}`;
            label = `${year}`;
            break;
        }

        if (!groups[key]) {
          groups[key] = { label, weeks: [], projectStats: {} };
        }
        groups[key].weeks.push(week);

        for (const snapshot of week.projects) {
          const projectTitle = getProjectTitle(data.projectsIndex, snapshot.projectId);
          if (!groups[key].projectStats[projectTitle]) {
            groups[key].projectStats[projectTitle] = { completed: 0, total: 0 };
          }
          groups[key].projectStats[projectTitle].total += snapshot.tasks.length;
          groups[key].projectStats[projectTitle].completed += snapshot.tasks.filter(
            (t) => t.completed
          ).length;
        }
      }

      return Object.values(groups);
    };

    const aggregated = aggregateData();

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-solarized-base01">History</h2>
          <Select
            value={historyAggregation}
            onValueChange={(v) => setHistoryAggregation(v as HistoryAggregation)}
          >
            <SelectTrigger className="w-32 h-8 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">By Week</SelectItem>
              <SelectItem value="month">By Month</SelectItem>
              <SelectItem value="quarter">By Quarter</SelectItem>
              <SelectItem value="year">By Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {aggregated.length === 0 ? (
          <p className="text-solarized-base1 text-sm">No archived weeks yet.</p>
        ) : (
          <div className="space-y-4">
            {aggregated.map((group) => (
              <div
                key={group.label}
                className="border border-solarized-base2 rounded-lg p-4 bg-solarized-base3"
              >
                <h3 className="font-semibold text-solarized-base01 mb-3">{group.label}</h3>
                <div className="space-y-2">
                  {Object.entries(group.projectStats).map(([projectTitle, stats]) => (
                    <div
                      key={projectTitle}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-solarized-base01">{projectTitle}</span>
                      <span className="text-solarized-base1 font-mono">
                        {stats.completed}/{stats.total} tasks
                      </span>
                    </div>
                  ))}
                </div>
                {historyAggregation !== "week" && (
                  <div className="mt-3 pt-3 border-t border-solarized-base2">
                    <p className="text-xs text-solarized-base1">
                      {group.weeks.length} week{group.weeks.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Separate BAU from other projects for sidebar
  const projectsWithoutBAU = data.projectsIndex.filter((p) => p.id !== "bau");
  const bauProject = data.projectsIndex.find((p) => p.id === "bau");

  return (
    <div className="flex h-screen bg-solarized-base3 font-mono text-solarized-base00">
      {/* Sidebar */}
      <div
        ref={sidebarRef}
        style={{ width: sidebarWidth }}
        className="border-r border-solarized-base2 bg-solarized-base2 flex flex-col relative"
      >
        <div className="p-4 border-b border-solarized-base1">
          <h1 className="text-lg font-bold text-solarized-base01">Weekly Tasks</h1>
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1 mb-2">
            <span className="text-xs font-semibold text-solarized-base1 uppercase">Projects</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-solarized-base1"
              onClick={handleAddProject}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleProjectDragEnd}
          >
            <SortableContext
              items={projectsWithoutBAU.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
                {projectsWithoutBAU.map((project) => {
                  const snapshot = activeWeek?.projects.find((p) => p.projectId === project.id);
                  const uncheckedCount = getUncheckedCount(project.id);
                  const urgentCount = getUrgentCount(project.id);
                  const isSelected = selectedProjectId === project.id;

                  return (
                    <SortableProject
                      key={project.id}
                      project={project}
                      snapshot={snapshot}
                      uncheckedCount={uncheckedCount}
                      urgentCount={urgentCount}
                      isSelected={isSelected}
                      onSelect={() => setSelectedProjectId(isSelected ? null : project.id)}
                    />
                  );
                })}
            </SortableContext>
          </DndContext>
        </div>

        {/* BAU Project - Fixed at bottom */}
        {bauProject && (
          <div className="p-2 border-t border-solarized-base1">
            {(() => {
              const snapshot = activeWeek?.projects.find((p) => p.projectId === bauProject.id);
              const uncheckedCount = getUncheckedCount(bauProject.id);
              const urgentCount = getUrgentCount(bauProject.id);
              const isSelected = selectedProjectId === bauProject.id;

              return (
                <div
                  className={`flex items-center gap-1 px-2 py-2 rounded cursor-pointer ${
                    isSelected
                      ? "bg-solarized-cyan text-solarized-base3 font-semibold"
                      : "hover:bg-solarized-base3 text-solarized-base00"
                  }`}
                  onClick={() => setSelectedProjectId(isSelected ? null : bauProject.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium break-words">{bauProject.title}</div>
                    {snapshot && (
                      <div
                        className={`text-xs mt-0.5 ${STATUS_COLORS[snapshot.status]} px-1 rounded inline-block`}
                      >
                        {snapshot.status}
                      </div>
                    )}
                  </div>
                  {uncheckedCount > 0 && (
                    <span className="text-xs bg-solarized-base1 text-solarized-base3 px-1.5 py-0.5 rounded-full ml-2 flex items-center gap-1">
                      {uncheckedCount}
                      {urgentCount > 0 && (
                        <>
                          <span className="text-solarized-base3">({urgentCount}</span>
                          <AlertTriangle className="h-2.5 w-2.5 text-solarized-orange" />
                          <span className="text-solarized-base3">)</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Week Selector */}
        <div className="p-2 border-t border-solarized-base1">
          <Select
            value={selectedWeekId || ""}
            onValueChange={(v) => {
              setSelectedWeekId(v);
              setEditMode(false);
            }}
          >
            <SelectTrigger className="w-full h-8 font-mono text-xs bg-solarized-base3">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              {data.weeks
                .slice()
                .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                .map((week) => (
                  <SelectItem key={week.id} value={week.id} className="font-mono text-xs">
                    {week.id === data.activeWeekId ? "(Active) " : ""}
                    {formatDate(week.startDate)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="p-2 border-t border-solarized-base1 space-y-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start font-mono text-xs"
            onClick={handleExport}
          >
            <Download className="h-3 w-3 mr-2" />
            Export All Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start font-mono text-xs"
            onClick={() => setShowImportDialog(true)}
          >
            <Upload className="h-3 w-3 mr-2" />
            Import Data
          </Button>
        </div>

        {/* Resize Handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-solarized-blue transition-colors"
          onMouseDown={handleMouseDown}
          style={{ backgroundColor: isResizing ? "var(--solarized-blue)" : "transparent" }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* View Tabs */}
        <div className="flex items-center gap-4 p-4 border-b border-solarized-base2">
          <Button
            variant={viewMode === "weekly" ? "default" : "ghost"}
            size="sm"
            className="font-mono text-xs"
            onClick={() => setViewMode("weekly")}
          >
            Weekly
          </Button>
          <Button
            variant={viewMode === "focus" ? "default" : "ghost"}
            size="sm"
            className="font-mono text-xs"
            onClick={() => setViewMode("focus")}
          >
            Focus
          </Button>
          <Button
            variant={viewMode === "history" ? "default" : "ghost"}
            size="sm"
            className="font-mono text-xs"
            onClick={() => setViewMode("history")}
          >
            History
          </Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {viewMode === "weekly" && renderWeeklyView()}
          {viewMode === "focus" && renderFocusView()}
          {viewMode === "history" && renderHistoryView()}
        </div>
      </div>

      {/* New Week Dialog */}
      <AlertDialog open={showNewWeekDialog} onOpenChange={setShowNewWeekDialog}>
        <AlertDialogContent className="font-mono bg-solarized-base3">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-solarized-base01">New Week Detected</AlertDialogTitle>
            <AlertDialogDescription className="text-solarized-base00">
              A new calendar week has started. Would you like to start a new week? Uncompleted tasks
              from projects that are not marked as "done" will be carried over.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleDismissNewWeek}
              className="font-mono text-xs"
            >
              Not Now
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStartNewWeek}
              className="font-mono text-xs"
            >
              Start New Week
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="font-mono bg-solarized-base3">
          <DialogHeader>
            <DialogTitle className="text-solarized-base01">Import Data</DialogTitle>
            <DialogDescription className="text-solarized-base00">
              Choose how to handle the imported data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                  className="accent-solarized-blue"
                />
                <span className="text-sm">Merge with existing data</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="accent-solarized-blue"
                />
                <span className="text-sm">Replace all data</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowImportDialog(false)}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="font-mono text-xs"
            >
              Select File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* Snackbar */}
      {snackbar && (
        <div className="fixed bottom-4 right-4 bg-solarized-base01 text-solarized-base3 px-4 py-2 rounded-lg shadow-lg font-mono text-sm">
          {snackbar}
        </div>
      )}
    </div>
  );
}

export default App
