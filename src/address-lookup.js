const streetTypes = {
  ave: 'avenue', blvd: 'boulevard', cir: 'circle', ct: 'court',
  dr: 'drive', hwy: 'highway', ln: 'lane', pl: 'place', pkwy: 'parkway',
  rd: 'road', sq: 'square', st: 'street', ter: 'terrace', trl: 'trail',
};
const normalize = text => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  .replace(/ ([a-z]+)$/, (match, suffix) => Object.hasOwn(streetTypes, suffix) ? ` ${streetTypes[suffix]}` : match);
const townSuffix = /,\s*bedford(?:\s*,?\s*(?:ma|massachusetts))?(?:\s+01730)?\s*$/i;
let addressIndex;

function loadAddresses() {
  addressIndex ??= fetch(new URL('../data/bedford-addresses.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Address lookup is temporarily unavailable.');
      return response.json();
    })
    .then(rows => rows.map(([street, lon, lat]) => ({
      label: `${street}, Bedford, MA`,
      key: normalize(street),
      coordinates: [lon, lat],
    })))
    .catch(error => {
      addressIndex = undefined;
      throw error;
    });
  return addressIndex;
}

const streetKey = text => normalize(text.replace(townSuffix, ''));

export async function resolveAddress(text) {
  const key = streetKey(text);
  const addresses = await loadAddresses();
  const address = addresses.find(entry => entry.key === key);
  if (!address) throw new Error(`Choose a Bedford address for “${text.trim()}”.`);
  return address.coordinates;
}

export function attachAddressLookup(input, list, message) {
  let matches = [];
  let active = -1;
  let revision = 0;

  function close() {
    revision++;
    matches = [];
    active = -1;
    list.hidden = true;
    list.replaceChildren();
    message.textContent = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function select(index) {
    input.value = matches[index].label;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function update() {
    close();
    const key = streetKey(input.value);
    if (key.length < 2) return;
    const request = revision;
    try {
      const addresses = await loadAddresses();
      if (request !== revision) return;
      const prefixes = [];
      const other = [];
      for (const entry of addresses) {
        if (entry.key.startsWith(key)) prefixes.push(entry);
        else if (entry.key.includes(` ${key}`)) other.push(entry);
      }
      matches = [...prefixes, ...other].slice(0, 6);
      for (const [index, match] of matches.entries()) {
        const option = document.createElement('li');
        option.id = `${list.id}-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.textContent = match.label;
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => select(index));
        list.append(option);
      }
      list.hidden = !matches.length;
      input.setAttribute('aria-expanded', String(Boolean(matches.length)));
      message.textContent = matches.length ? `${matches.length} Bedford addresses found.` : 'No Bedford addresses found.';
    } catch {
      if (request === revision) message.textContent = 'Address lookup is temporarily unavailable.';
    }
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => {
    if (!townSuffix.test(input.value)) update();
  });
  input.addEventListener('blur', event => {
    if (!list.contains(event.relatedTarget)) close();
  });
  input.addEventListener('keydown', event => {
    if (!matches.length || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      select(active);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const start = active < 0 && direction < 0 ? 0 : active;
      active = (start + direction + matches.length) % matches.length;
      for (const [index, option] of Array.from(list.children).entries()) {
        option.setAttribute('aria-selected', String(index === active));
      }
      const option = list.children[active];
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    }
  });
}
