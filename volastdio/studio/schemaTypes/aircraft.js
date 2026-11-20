import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'aircraft',
  title: 'Aeronave',
  type: 'document',
  fields: [
    defineField({
      name: 'modelo',
      title: 'Modelo',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({
      name: 'tipo',
      title: 'Tipo',
      type: 'string',
      options: {
        list: [
          {title: 'Helicóptero', value: 'helicopter'},
          {title: 'Pistão', value: 'piston'},
          {title: 'Turboélice', value: 'turboprop'},
          {title: 'Jato', value: 'jet'},
        ],
        layout: 'dropdown',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'assentos',
      title: 'Assentos de passageiros',
      type: 'number',
      validation: (rule) => rule.required().integer().positive().max(50),
    }),
    defineField({
      name: 'porteMinimo',
      title: 'Porte mínimo do aeroporto',
      type: 'string',
      options: {
        list: [
          {title: 'Pequeno', value: 'Pequeno'},
          {title: 'Medio', value: 'Medio'},
          {title: 'Grande', value: 'Grande'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'modelo',
      tipo: 'tipo',
      assentos: 'assentos',
      porteMinimo: 'porteMinimo',
    },
    prepare({title, tipo, assentos, porteMinimo}) {
      return {
        title,
        subtitle: `${tipo || ''} • ${assentos || '?'} assentos • aeroporto ${porteMinimo || '?'}`,
      }
    },
  },
})