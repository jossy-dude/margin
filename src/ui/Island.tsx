import React from 'react';
import { Pressable, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './kit';
import { RADIUS, SHADOW, SPACE, TYPE, V2, type Scheme } from '../tokens/v2';

/**
 * v0.7 U6 — the nav island (DESIGN.md D-10): a floating strong-glass pill, 64 dp tall, 16 dp above the bottom
 * inset, five destinations and the "+" at its right end, so no floating button covers content (F9). While the
 * page scrolls down it collapses to a 48 dp pill with only the current tab and "+"; it expands on scroll up or a tap.
 * `islandSpace` is the padding a scrolling page adds at its end so nothing is hidden under the island.
 */
export interface IslandTab { name: string; label: string; icon: string }
export const ISLAND_H = 64;
export const ISLAND_COLLAPSED_H = 48;
export const islandSpace = (bottomInset: number) => ISLAND_H + SPACE.s4 + bottomInset + SPACE.s4;

/** Collapse while scrolling down past 64 dp; expand on any scroll up. Pure, so the rule is tested. */
export function islandCollapsed(prevY: number, y: number, wasCollapsed: boolean): boolean {
  if (y < 64) return false;
  if (y > prevY + 4) return true;
  if (y < prevY - 4) return false;
  return wasCollapsed;
}

export function Island({ tabs, current, onTab, onAdd, onAddLong, collapsed, onExpand, scheme }: {
  tabs: IslandTab[]; current: string; onTab: (name: string) => void; onAdd: () => void; onAddLong?: () => void;
  collapsed?: boolean; onExpand?: () => void; scheme?: Scheme;
}) {
  const sys = useColorScheme();
  const t = V2[scheme ?? (sys === 'dark' ? 'dark' : 'light')];
  const insets = useSafeAreaInsets();
  const shown = collapsed ? tabs.filter((x) => x.name === current) : tabs;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + SPACE.s4, alignItems: 'center' }}>
      <View accessibilityRole="tablist" style={{
        flexDirection: 'row', alignItems: 'center', height: collapsed ? ISLAND_COLLAPSED_H : ISLAND_H, paddingHorizontal: SPACE.s2, gap: 2,
        borderRadius: RADIUS.island, backgroundColor: t.glassStrong, borderWidth: 1, borderColor: t.ring,
        shadowColor: SHADOW, shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 6,
      }}>
        {shown.map((x) => {
          const on = x.name === current;
          return (
            <Pressable key={x.name} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.label} testID={`island-${x.name}`}
              onPress={() => (collapsed ? onExpand?.() : onTab(x.name))}
              style={{ minWidth: 56, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.s2, backgroundColor: on ? t.fill : 'transparent' }}>
              <Icon name={x.icon} size={24} color={on ? t.ink : t.ink2} />
              {collapsed ? null : <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: TYPE.label.weight, color: on ? t.ink : t.ink2 }}>{x.label}</Text>}
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Add" accessibilityHint="Long press to add a task" testID="island-add"
          onPress={onAdd} onLongPress={onAddLong} style={{ width: 48, height: 48, borderRadius: 24, marginLeft: SPACE.s1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.ink }}>
          <Icon name="plus" size={24} color={t.flat} />
        </Pressable>
      </View>
    </View>
  );
}
