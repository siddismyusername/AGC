declare module 'lucide-react' {
  import * as React from 'react';

  type IconProps = React.SVGProps<SVGSVGElement> & {
    size?: number | string;
    absoluteStrokeWidth?: boolean;
  };

  export const Activity: React.FC<IconProps>;
  export const AlertTriangle: React.FC<IconProps>;
  export const ArrowRight: React.FC<IconProps>;
  export const Building2: React.FC<IconProps>;
  export const CheckCircle2: React.FC<IconProps>;
  export const FileImage: React.FC<IconProps>;
  export const FileText: React.FC<IconProps>;
  export const Filter: React.FC<IconProps>;
  export const GitBranch: React.FC<IconProps>;
  export const LockKeyhole: React.FC<IconProps>;
  export const Mail: React.FC<IconProps>;
  export const Network: React.FC<IconProps>;
  export const Radar: React.FC<IconProps>;
  export const RefreshCw: React.FC<IconProps>;
  export const ShieldCheck: React.FC<IconProps>;
  export const Trash2: React.FC<IconProps>;
  export const TrendingUp: React.FC<IconProps>;
  export const Upload: React.FC<IconProps>;
  export const UserRound: React.FC<IconProps>;
  export const Workflow: React.FC<IconProps>;
}