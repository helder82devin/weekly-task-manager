import { StorageRoot, Week, ProjectIndex, ProjectSnapshot, Task } from "./types";

const STORAGE_KEY = "weekly-task-assistant";
const BAU_PROJECT_ID = "bau";

function generateId(): string {
  return crypto.randomUUID();
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getSunday(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getCurrentWeekDates(): { startDate: string; endDate: string } {
  const monday = getMonday(new Date());
  const sunday = getSunday(monday);
  return {
    startDate: monday.toISOString().split("T")[0],
    endDate: sunday.toISOString().split("T")[0],
  };
}

export function getWeekId(startDate: string): string {
  return `week-${startDate}`;
}

function createDefaultStorage(): StorageRoot {
  const { startDate, endDate } = getCurrentWeekDates();
  const weekId = getWeekId(startDate);

  return {
    weeks: [
      {
        id: weekId,
        startDate,
        endDate,
        projects: [
          {
            projectId: BAU_PROJECT_ID,
            status: "to do",
            tasks: [],
          },
        ],
        archived: false,
      },
    ],
    activeWeekId: weekId,
    projectsIndex: [
      {
        id: BAU_PROJECT_ID,
        title: "BAU",
      },
    ],
  };
}

export function loadStorage(): StorageRoot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaultData = createDefaultStorage();
      saveStorage(defaultData);
      return defaultData;
    }
    const data = JSON.parse(raw) as StorageRoot;
    
    const hasBAU = data.projectsIndex.some((p) => p.id === BAU_PROJECT_ID);
    if (!hasBAU) {
      data.projectsIndex.unshift({ id: BAU_PROJECT_ID, title: "BAU" });
    }
    
    return data;
  } catch {
    const defaultData = createDefaultStorage();
    saveStorage(defaultData);
    return defaultData;
  }
}

export function saveStorage(data: StorageRoot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function createNewWeek(data: StorageRoot): StorageRoot {
  const { startDate, endDate } = getCurrentWeekDates();
  const newWeekId = getWeekId(startDate);

  const activeWeek = data.weeks.find((w) => w.id === data.activeWeekId);
  if (!activeWeek) {
    return data;
  }

  activeWeek.archived = true;

  const newProjects: ProjectSnapshot[] = [];

  for (const project of activeWeek.projects) {
    if (project.status === "done") {
      continue;
    }

    const uncheckedTasks: Task[] = project.tasks
      .filter((t) => !t.completed)
      .map((t) => ({
        ...t,
        id: generateId(),
        completed: false,
        completedAt: undefined,
      }));

    newProjects.push({
      projectId: project.projectId,
      status: project.status,
      tasks: uncheckedTasks,
    });
  }

  const hasBAU = newProjects.some((p) => p.projectId === BAU_PROJECT_ID);
  if (!hasBAU) {
    newProjects.unshift({
      projectId: BAU_PROJECT_ID,
      status: "to do",
      tasks: [],
    });
  }

  const newWeek: Week = {
    id: newWeekId,
    startDate,
    endDate,
    projects: newProjects,
    archived: false,
  };

  return {
    ...data,
    weeks: [...data.weeks, newWeek],
    activeWeekId: newWeekId,
  };
}

export function checkWeekChange(data: StorageRoot): boolean {
  const { startDate } = getCurrentWeekDates();
  const currentWeekId = getWeekId(startDate);
  return data.activeWeekId !== currentWeekId;
}

export function addProject(data: StorageRoot, title: string): StorageRoot {
  const projectId = generateId();
  const newProjectIndex: ProjectIndex = { id: projectId, title };

  const activeWeek = data.weeks.find((w) => w.id === data.activeWeekId);
  if (!activeWeek) return data;

  const newSnapshot: ProjectSnapshot = {
    projectId,
    status: "to do",
    tasks: [],
  };

  return {
    ...data,
    projectsIndex: [...data.projectsIndex, newProjectIndex],
    weeks: data.weeks.map((w) =>
      w.id === data.activeWeekId
        ? { ...w, projects: [...w.projects, newSnapshot] }
        : w
    ),
  };
}

export function deleteProject(data: StorageRoot, projectId: string): StorageRoot {
  if (projectId === BAU_PROJECT_ID) return data;

  return {
    ...data,
    projectsIndex: data.projectsIndex.filter((p) => p.id !== projectId),
    weeks: data.weeks.map((w) => ({
      ...w,
      projects: w.projects.filter((p) => p.projectId !== projectId),
    })),
  };
}

export function updateProjectTitle(
  data: StorageRoot,
  projectId: string,
  title: string
): StorageRoot {
  return {
    ...data,
    projectsIndex: data.projectsIndex.map((p) =>
      p.id === projectId ? { ...p, title } : p
    ),
  };
}

export function updateProjectStatus(
  data: StorageRoot,
  weekId: string,
  projectId: string,
  status: ProjectSnapshot["status"]
): StorageRoot {
  return {
    ...data,
    weeks: data.weeks.map((w) =>
      w.id === weekId
        ? {
            ...w,
            projects: w.projects.map((p) =>
              p.projectId === projectId ? { ...p, status } : p
            ),
          }
        : w
    ),
  };
}

export function addTask(
  data: StorageRoot,
  weekId: string,
  projectId: string,
  text: string,
  urgent: boolean = false
): StorageRoot {
  const task: Task = {
    id: generateId(),
    text,
    completed: false,
    urgent,
    createdAt: new Date().toISOString(),
  };

  return {
    ...data,
    weeks: data.weeks.map((w) =>
      w.id === weekId
        ? {
            ...w,
            projects: w.projects.map((p) =>
              p.projectId === projectId
                ? { ...p, tasks: [...p.tasks, task] }
                : p
            ),
          }
        : w
    ),
  };
}

export function updateTask(
  data: StorageRoot,
  weekId: string,
  projectId: string,
  taskId: string,
  updates: Partial<Pick<Task, "text" | "completed" | "urgent">>
): StorageRoot {
  return {
    ...data,
    weeks: data.weeks.map((w) =>
      w.id === weekId
        ? {
            ...w,
            projects: w.projects.map((p) =>
              p.projectId === projectId
                ? {
                    ...p,
                    tasks: p.tasks.map((t) =>
                      t.id === taskId
                        ? {
                            ...t,
                            ...updates,
                            completedAt:
                              updates.completed === true
                                ? new Date().toISOString()
                                : updates.completed === false
                                ? undefined
                                : t.completedAt,
                          }
                        : t
                    ),
                  }
                : p
            ),
          }
        : w
    ),
  };
}

export function deleteTask(
  data: StorageRoot,
  weekId: string,
  projectId: string,
  taskId: string
): StorageRoot {
  return {
    ...data,
    weeks: data.weeks.map((w) =>
      w.id === weekId
        ? {
            ...w,
            projects: w.projects.map((p) =>
              p.projectId === projectId
                ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
                : p
            ),
          }
        : w
    ),
  };
}

export function countUrgentTasks(week: Week): number {
  return week.projects.reduce(
    (count, p) => count + p.tasks.filter((t) => t.urgent && !t.completed).length,
    0
  );
}

export function getProjectTitle(
  projectsIndex: ProjectIndex[],
  projectId: string
): string {
  return projectsIndex.find((p) => p.id === projectId)?.title || "Unknown";
}

export function ensureProjectInWeek(
  data: StorageRoot,
  weekId: string,
  projectId: string
): StorageRoot {
  const week = data.weeks.find((w) => w.id === weekId);
  if (!week) return data;

  const hasProject = week.projects.some((p) => p.projectId === projectId);
  if (hasProject) return data;

  return {
    ...data,
    weeks: data.weeks.map((w) =>
      w.id === weekId
        ? {
            ...w,
            projects: [
              ...w.projects,
              { projectId, status: "to do", tasks: [] },
            ],
          }
        : w
    ),
  };
}
