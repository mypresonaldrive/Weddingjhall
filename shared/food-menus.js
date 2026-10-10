export const FOOD_TYPES = ['Vegetarian', 'Jain / No onion-garlic', 'Non-vegetarian', 'Mixed menu'];
export const MENU_SECTIONS = ['Welcome drinks', 'Starters', 'Main course', 'Breads & rice', 'Desserts', 'Live counters', 'Other'];
export function normalizeMenus(value = []) {
  if (!Array.isArray(value) || value.length > 4) throw Error('Add up to four food menus, one for each meal type.');
  const types = new Set(); let total = 0;
  return value.map(menu => {
    if (!menu || !FOOD_TYPES.includes(menu.plateType) || types.has(menu.plateType)) throw Error('Each food menu needs a unique, valid meal type.');
    types.add(menu.plateType);
    if (!Array.isArray(menu.sections) || !menu.sections.length || menu.sections.length > 8) throw Error('Each menu needs between 1 and 8 food sections.');
    const names = new Set();
    return { plateType: menu.plateType, sections: menu.sections.map(section => {
      if (!section || typeof section.name !== 'string') throw Error('Enter a name for every menu section.');
      const name = section.name.replace(/\s+/g,' ').trim();
      if (!name || name.length > 50 || names.has(name.toLowerCase())) throw Error('Menu section names must be unique and 1–50 characters long.');
      names.add(name.toLowerCase());
      if (!Array.isArray(section.items) || section.items.length > 20) throw Error('Add up to 20 food items per section.');
      const seen = new Set();
      const items = section.items.reduce((result,item) => {
        if (typeof item !== 'string') throw Error('Food items must be text.');
        const text = item.replace(/\s+/g,' ').trim();
        if (text.length > 100) throw Error('Food item names must be 100 characters or fewer.');
        if (text && !seen.has(text.toLowerCase())) { seen.add(text.toLowerCase()); result.push(text); }
        return result;
      }, []);
      if (!items.length) throw Error(`Add at least one food item to ${name}.`);
      total += items.length;
      if (total > 160) throw Error('A pricing model can contain up to 160 food items.');
      return { name, items };
    }) };
  });
}
export const sampleMenus = FOOD_TYPES.map(plateType => ({ plateType, sections: [
  { name:'Welcome drinks', items:['Jaljeera','Fresh lime soda'] },
  { name:'Starters', items:plateType==='Jain / No onion-garlic'?['Jain paneer tikka','Crispy baby corn']:plateType==='Non-vegetarian'?['Chicken tikka','Hara bhara kebab']:plateType==='Mixed menu'?['Paneer tikka','Chicken tikka']:['Paneer tikka','Hara bhara kebab'] },
  { name:'Main course', items:plateType==='Jain / No onion-garlic'?['Jain shahi paneer','Dal without onion or garlic']:plateType==='Non-vegetarian'?['Butter chicken','Dal makhani']:plateType==='Mixed menu'?['Shahi paneer','Butter chicken','Dal makhani']:['Shahi paneer','Dal makhani','Seasonal vegetables'] },
  { name:'Breads & rice', items:['Tandoori roti','Jeera rice'] },
  { name:'Desserts', items:['Gulab jamun','Ice cream'] },
] }));
export const menuItemCount = menu => (menu?.sections || []).reduce((sum,section)=>sum+(section.items||[]).filter(item=>item.trim()).length,0);
