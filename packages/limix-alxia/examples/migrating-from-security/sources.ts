import { mutableSource, staticSource } from '@softistx/limix';
import { policy } from './rules';

// was: staticPolicySource(raw)
export const fixed = staticSource(policy);

// New: a source you swap by hand (`swap(null)` withdraws the policy).
export const live = mutableSource();
live.swap(policy);
