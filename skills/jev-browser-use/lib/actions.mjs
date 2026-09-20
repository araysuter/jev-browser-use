import { clickRoles, safeKeys, parseState, matchesName, matchesPattern, permitted } from './state.mjs';
function controlNames(control) {
  return [control.name,...(control.aliases ?? [])].filter(name => typeof name === 'string' && name);
}


function semanticName(name) { return name.replace(/, Value:.*$/, ''); }
export function validateControl(control) {
  if (!control || typeof control !== 'object') return false;
  if (control.op === 'click') return typeof control.name === 'string' && !!control.name;
  if (control.op === 'scroll') return ['up','down'].includes(control.direction) && Number.isInteger(control.amount ?? 1) && (control.amount ?? 1) >= 1 && (control.amount ?? 1) <= 5 && (!control.targetName || typeof control.targetName === 'string') && (!control.point || (Array.isArray(control.point) && control.point.length === 2 && control.point.every(Number.isFinite))) && !(control.targetName && control.point);
  if (control.op === 'press') return safeKeys.has(control.key);
  return control.op === 'reload';
}

function description(control) {
  if (control.description) return control.description;
  if (control.op === 'scroll') return `Scroll ${control.direction}${(control.amount ?? 1) > 1 ? ` ${control.amount} pages` : ''}${control.targetName ? ` within ${control.targetName}` : control.point ? ' within the Codex-identified region' : ''}`;
  if (control.op === 'press') return `Press ${control.key}`;
  if (control.op === 'reload') return 'Reload the current page';
  return `Click ${control.name}`;
}

export function availableActions(state, controls=[], policy={}) {
  const entries = parseState(state);
  const actions = [];
  for (const control of controls) {
    if (!validateControl(control)) throw new Error('Unsupported action');
    if (control.op === 'scroll') {
      const names = [control.targetName,...(control.targetAliases ?? [])].filter(Boolean);
      const matches = names.length ? entries.filter(entry => names.some(name => matchesName(entry.name,name))) : [];
      if (names.length && matches.length !== 1) continue;
      actions.push({...control,target:control.point ?? matches[0]?.index,amount:control.amount ?? 1,description:description(control)});
      continue;
    }
    if (['press','reload'].includes(control.op)) {
      actions.push({...control,description:description(control)});
      continue;
    }
    const names = controlNames(control);
    const matches = entries.filter(entry => clickRoles.has(entry.role) && names.some(name => matchesName(entry.name,name)));
    if (matches.length !== 1) continue;
    actions.push({...control,index:matches[0].index,observedName:matches[0].name,description:description(control)});
  }
  return actions.filter(action => permitted(action, policy));
}

// Codex may opt in to all currently observed low-risk mechanical actions.
// Text fields are never auto-discovered; Codex supplies and enters text.
export function discoverActions(state, policy={}) {
  const entries = parseState(state);
  const denied = policy.denyNames ?? [];
  const allowed = policy.allowNames ?? [];
  const counts = new Map();
  for (const entry of entries.filter(entry => clickRoles.has(entry.role))) counts.set(semanticName(entry.name),(counts.get(semanticName(entry.name)) ?? 0)+1);
  const actions = [];
  if (policy.click === true) {
    for (const entry of entries) {
      if (!clickRoles.has(entry.role) || counts.get(semanticName(entry.name)) !== 1) continue;
      if (denied.some(pattern => matchesPattern(entry.name,pattern))) continue;
      if (allowed.length && !allowed.some(pattern => matchesPattern(entry.name,pattern))) continue;
      actions.push({op:'click',name:entry.label,index:entry.index,observedName:entry.name,description:`Click ${entry.name}`});
    }
  }
  const scrollAmount = Number.isInteger(policy.scrollAmount) && policy.scrollAmount >= 1 && policy.scrollAmount <= 5 ? policy.scrollAmount : 1;
  const scrollNames = [policy.scrollTargetName,...(policy.scrollTargetAliases ?? [])].filter(Boolean);
  const scrollMatches = scrollNames.length ? entries.filter(entry => scrollNames.some(name => matchesName(entry.name,name))) : [];
  const validPoint = Array.isArray(policy.scrollPoint) && policy.scrollPoint.length === 2 && policy.scrollPoint.every(Number.isFinite);
  const scrollTarget = validPoint ? policy.scrollPoint : scrollMatches.length === 1 ? scrollMatches[0].index : undefined;
  const canScroll = !scrollNames.length || scrollMatches.length === 1;
  for (const direction of policy.scrollDirections ?? []) if (['up','down'].includes(direction) && canScroll) actions.push({op:'scroll',direction,amount:scrollAmount,target:scrollTarget,description:`Scroll ${direction}${scrollAmount > 1 ? ` ${scrollAmount} pages` : ''}${scrollNames.length ? ` within ${policy.scrollTargetName}` : validPoint ? ' within the Codex-identified region' : ''}`});
  for (const key of policy.keys ?? []) if (safeKeys.has(key)) actions.push({op:'press',key,description:`Press ${key}`});
  if (policy.reload === true) actions.push({op:'reload',description:'Reload the current page'});
  return actions.filter(action => permitted(action, policy));
}

