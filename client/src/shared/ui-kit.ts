import type { FC } from 'react';
import { Button as ButtonBase } from '../components/ui/Button';
import {
  TextInput as TextInputBase,
  Select as SelectBase,
  TextArea as TextAreaBase,
  Checkbox as CheckboxBase,
} from '../components/ui/FormControls';
import { StatusBadge as StatusBadgeBase, AuditBanner as AuditBannerBase } from '../components/ui/Badges';
import {
  Sidebar as SidebarBase,
  Navbar as NavbarBase,
  AppLayout as AppLayoutBase,
} from '../components/ui/AppLayout';
import {
  StatCard as StatCardBase,
  ProcessStepper as ProcessStepperBase,
  Pagination as PaginationBase,
  DataTable as DataTableBase,
} from '../components/ui/DataDisplay';

export const Button = ButtonBase as FC<any>;
export const TextInput = TextInputBase as FC<any>;
export const Select = SelectBase as FC<any>;
export const TextArea = TextAreaBase as FC<any>;
export const Checkbox = CheckboxBase as FC<any>;
export const StatusBadge = StatusBadgeBase as FC<any>;
export const AuditBanner = AuditBannerBase as FC<any>;
export const Sidebar = SidebarBase as FC<any>;
export const Navbar = NavbarBase as FC<any>;
export const AppLayout = AppLayoutBase as FC<any>;
export const StatCard = StatCardBase as FC<any>;
export const ProcessStepper = ProcessStepperBase as FC<any>;
export const Pagination = PaginationBase as FC<any>;
export const DataTable = DataTableBase as FC<any>;