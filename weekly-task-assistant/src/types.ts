export type ProjectStatus = "to do" | "in progress" | "blocked" | "done";

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  urgent: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface ProjectSnapshot {
  projectId: string;
  status: ProjectStatus;
  tasks: Task[];
}

export interface Week {
  id: string;
  startDate: string;
  endDate: string;
  projects: ProjectSnapshot[];
  archived: boolean;
}

export interface ProjectIndex {
  id: string;
  title: string;
}

export interface StorageRoot {
  weeks: Week[];
  activeWeekId: string;
  projectsIndex: ProjectIndex[];
}

export interface ExportData {
  version: string;
  exportedAt: string;
  data: {
    weeks: Week[];
    projectsIndex: ProjectIndex[];
    activeWeekId: string;
  };
}

export type ViewMode = "weekly" | "focus" | "history";
export type HistoryAggregation = "week" | "month" | "quarter" | "year";
