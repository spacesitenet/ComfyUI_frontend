import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  LGraphNode,
  applyWidgetValuesFromSerialized
} from '@/lib/litegraph/src/litegraph'
import type { TWidgetValue } from '@/lib/litegraph/src/litegraph'
import type { ISerialisedNode } from '@/lib/litegraph/src/types/serialisation'
import {
  applyWidgetValuesByDefinitionOrder,
  sortWidgetValuesByInputOrder
} from '@/workbench/utils/nodeDefOrderingUtil'

describe('LGraphNode widget ordering', () => {
  let node: LGraphNode

  beforeEach(() => {
    setActivePinia(createTestingPinia({ stubActions: false }))
    node = new LGraphNode('TestNode')
  })

  describe('configure with widgets_values', () => {
    it('should apply widget values in correct order when widgets order matches input_order', () => {
      // Create node with widgets
      node.addWidget('number', 'steps', 20, null, {})
      node.addWidget('number', 'seed', 0, null, {})
      node.addWidget('text', 'prompt', '', null, {})

      // Configure with widget values
      const info: ISerialisedNode = {
        id: 1,
        type: 'TestNode',
        pos: [0, 0],
        size: [200, 100],
        flags: {},
        order: 0,
        mode: 0,
        widgets_values: [30, 12345, 'test prompt']
      }

      node.configure(info)

      // Check widget values are applied correctly
      expect(node.widgets![0].value).toBe(30) // steps
      expect(node.widgets![1].value).toBe(12345) // seed
      expect(node.widgets![2].value).toBe('test prompt') // prompt
    })

    it('should handle mismatched widget order with input_order', () => {
      // Simulate widgets created in wrong order (e.g., from unordered Object.entries)
      // but widgets_values is in the correct order according to input_order
      node.addWidget('number', 'seed', 0, null, {})
      node.addWidget('text', 'prompt', '', null, {})
      node.addWidget('number', 'steps', 20, null, {})

      // Widget values are in input_order: [steps, seed, prompt]
      const info: ISerialisedNode = {
        id: 1,
        type: 'TestNode',
        pos: [0, 0],
        size: [200, 100],
        flags: {},
        order: 0,
        mode: 0,
        widgets_values: [30, 12345, 'test prompt']
      }

      // This would apply values incorrectly without proper ordering
      node.configure(info)

      // Without fix, values would be applied in wrong order:
      // seed (widget[0]) would get 30 (should be 12345)
      // prompt (widget[1]) would get 12345 (should be 'test prompt')
      // steps (widget[2]) would get 'test prompt' (should be 30)

      // This test demonstrates the bug - values are applied in wrong order
      expect(node.widgets![0].value).toBe(30) // seed gets steps value (WRONG)
      expect(node.widgets![1].value).toBe(12345) // prompt gets seed value (WRONG)
      expect(node.widgets![2].value).toBe('test prompt') // steps gets prompt value (WRONG)
    })

    it('should skip widgets with serialize: false', () => {
      node.addWidget('number', 'steps', 20, null, {})
      node.addWidget('button', 'action', 'Click', null, {})
      node.widgets![1].serialize = false // button should not serialize
      node.addWidget('number', 'seed', 0, null, {})

      const info: ISerialisedNode = {
        id: 1,
        type: 'TestNode',
        pos: [0, 0],
        size: [200, 100],
        flags: {},
        order: 0,
        mode: 0,
        // Sparse indices matching serialize(): gap at index 1 (serialize: false)
        widgets_values: [30, null, 12345] as TWidgetValue[]
      }

      node.configure(info)

      expect(node.widgets![0].value).toBe(30) // steps
      expect(node.widgets![1].value).toBe('Click') // button unchanged
      expect(node.widgets![2].value).toBe(12345) // seed
    })

    it('should round-trip widgets_values when a serialize:false widget creates an index gap', () => {
      // Mimics TextEncodeAceStepAudio1_5: seed + control_after_generate (serialize: false)
      // + combo widgets such as timesignature and language.
      node.addWidget('number', 'seed', 0, null, {})
      node.addWidget('combo', 'control_after_generate', 'randomize', null, {
        values: ['fixed', 'increment', 'decrement', 'randomize']
      })
      node.widgets![1].serialize = false
      node.addWidget('combo', 'timesignature', '2', null, {
        values: ['2', '3', '4', '6']
      })
      node.addWidget('combo', 'language', 'en', null, {
        values: ['en', 'de', 'fr']
      })

      node.widgets![2].value = '4'
      node.widgets![3].value = 'de'

      node.serialize_widgets = true
      const serialized = node.serialize()

      const reloaded = new LGraphNode('TestNode')
      reloaded.addWidget('number', 'seed', 0, null, {})
      reloaded.addWidget('combo', 'control_after_generate', 'randomize', null, {
        values: ['fixed', 'increment', 'decrement', 'randomize']
      })
      reloaded.widgets![1].serialize = false
      reloaded.addWidget('combo', 'timesignature', '2', null, {
        values: ['2', '3', '4', '6']
      })
      reloaded.addWidget('combo', 'language', 'en', null, {
        values: ['en', 'de', 'fr']
      })
      reloaded.configure(serialized)

      expect(reloaded.widgets![0].value).toBe(0)
      expect(reloaded.widgets![1].value).toBe('randomize')
      expect(reloaded.widgets![2].value).toBe('4')
      expect(reloaded.widgets![3].value).toBe('de')
    })

    it('restores ACE Step template values when timesignature and language widgets are swapped', () => {
      const definitionOrder = [
        'tags',
        'lyrics',
        'seed',
        'control_after_generate',
        'bpm',
        'duration',
        'timesignature',
        'language',
        'keyscale'
      ]
      const templateValues = [
        'Neo-Soul tags',
        'Lyrics',
        31,
        'fixed',
        190,
        120,
        '4',
        'en',
        'E minor'
      ]

      node.addWidget('text', 'tags', '', null, {})
      node.addWidget('text', 'lyrics', '', null, {})
      node.addWidget('number', 'seed', 0, null, {})
      node.addWidget('combo', 'control_after_generate', 'randomize', null, {
        values: ['fixed', 'randomize']
      })
      node.widgets![3].serialize = false
      node.addWidget('number', 'bpm', 120, null, {})
      node.addWidget('number', 'duration', 120, null, {})
      node.addWidget('combo', 'language', 'en', null, { values: ['en', 'de'] })
      node.addWidget('combo', 'timesignature', '2', null, {
        values: ['2', '3', '4', '6']
      })
      node.addWidget('combo', 'keyscale', 'C major', null, {
        values: ['C major', 'E minor']
      })

      applyWidgetValuesByDefinitionOrder(
        node.widgets!,
        templateValues,
        definitionOrder
      )

      expect(node.widgets!.find((w) => w.name === 'timesignature')!.value).toBe(
        '4'
      )
      expect(node.widgets!.find((w) => w.name === 'language')!.value).toBe('en')
    })
  })
})

describe('applyWidgetValuesFromSerialized', () => {
  it('uses widget index mapping for sparse widgets_values arrays', () => {
    const node = new LGraphNode('TestNode')
    node.addWidget('combo', 'timesignature', '2', null, {
      values: ['2', '3', '4', '6']
    })
    node.addWidget('combo', 'control_after_generate', 'randomize', null, {
      values: ['fixed', 'randomize']
    })
    node.widgets![1].serialize = false
    node.addWidget('combo', 'language', 'en', null, { values: ['en', 'de'] })

    applyWidgetValuesFromSerialized(node.widgets!, [
      '4',
      null,
      'de'
    ] as TWidgetValue[])

    expect(node.widgets![0].value).toBe('4')
    expect(node.widgets![1].value).toBe('randomize')
    expect(node.widgets![2].value).toBe('de')
  })

  it('uses dense mapping for legacy compact widgets_values arrays', () => {
    const node = new LGraphNode('TestNode')
    node.addWidget('number', 'non-serializable', 1, null, {})
    node.widgets![0].serialize = false
    node.addWidget('number', 'serializable', 2, null, {})

    applyWidgetValuesFromSerialized(node.widgets!, [100])

    expect(node.widgets![0].value).toBe(1)
    expect(node.widgets![1].value).toBe(100)
  })
})

describe('sortWidgetValuesByInputOrder', () => {
  it('should reorder widget values based on input_order', () => {
    const inputOrder = ['steps', 'seed', 'prompt']
    const currentWidgetOrder = ['seed', 'prompt', 'steps']
    const widgetValues = [12345, 'test prompt', 30]

    const reordered = sortWidgetValuesByInputOrder(
      widgetValues,
      currentWidgetOrder,
      inputOrder
    )

    // Should reorder to match input_order: [steps, seed, prompt]
    expect(reordered).toEqual([30, 12345, 'test prompt'])
  })

  it('should handle widgets not in input_order', () => {
    const inputOrder = ['steps', 'seed']
    const currentWidgetOrder = ['seed', 'prompt', 'steps', 'cfg']
    const widgetValues = [12345, 'test prompt', 30, 7.5]

    const reordered = sortWidgetValuesByInputOrder(
      widgetValues,
      currentWidgetOrder,
      inputOrder
    )

    // Should put ordered items first, then unordered
    expect(reordered).toEqual([30, 12345, 'test prompt', 7.5])
  })

  it('should handle empty input_order', () => {
    const inputOrder: string[] = []
    const currentWidgetOrder = ['seed', 'prompt', 'steps']
    const widgetValues = [12345, 'test prompt', 30]

    const reordered = sortWidgetValuesByInputOrder(
      widgetValues,
      currentWidgetOrder,
      inputOrder
    )

    // Should return values unchanged
    expect(reordered).toEqual([12345, 'test prompt', 30])
  })

  it('should handle mismatched array lengths', () => {
    const inputOrder = ['steps', 'seed', 'prompt']
    const currentWidgetOrder = ['seed', 'prompt']
    const widgetValues = [12345, 'test prompt', 30] // Extra value

    const reordered = sortWidgetValuesByInputOrder(
      widgetValues,
      currentWidgetOrder,
      inputOrder
    )

    // Should handle gracefully, keeping extra values at the end
    // Since 'steps' is not in currentWidgetOrder, it won't be reordered
    // Only 'seed' and 'prompt' will be reordered based on input_order
    expect(reordered).toEqual([12345, 'test prompt', 30])
  })
})
