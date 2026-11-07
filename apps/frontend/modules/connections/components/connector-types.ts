export type Connector = {
  id: string;
  platform: 'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
  label: string;
  handle: string;
  profileUrl: string;
  status: 'connected' | 'disconnected' | 'sign-in-open' | 'api-required';
  verifiedAt: string | null;
  authentication: 'browser' | 'api-required';
  interactiveSignIn?: boolean;
};
