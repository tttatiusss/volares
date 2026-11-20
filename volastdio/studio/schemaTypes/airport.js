import {defineArrayMember, defineField, defineType} from 'sanity'

export default defineType({
  name: 'airport',
  title: 'Aeroporto',
  type: 'document',
  fields: [
    defineField({
      name: 'code',
      title: 'Código ICAO',
      type: 'string',
      validation: (rule) =>
        rule
          .required()
          .length(4)
          .uppercase()
          .regex(/^[A-Z]{2}[A-Z0-9]{2}$/),
    }),
    defineField({
      name: 'name',
      title: 'Nome',
      type: 'string',
      validation: (rule) => rule.required().max(150),
    }),
    defineField({
      name: 'city',
      title: 'Cidade',
      type: 'string',
      validation: (rule) => rule.required().max(100),
    }),
    defineField({
      name: 'state',
      title: 'Estado',
      type: 'string',
      options: {
        list: [
          'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
          'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
          'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
        ],
        layout: 'dropdown',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'region',
      title: 'Região',
      type: 'string',
      options: {
        list: [
          {title: 'Norte', value: 'north'},
          {title: 'Nordeste', value: 'northeast'},
          {title: 'Centro-Oeste', value: 'centralWest'},
          {title: 'Sudeste', value: 'southeast'},
          {title: 'Sul', value: 'south'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'porte',
      title: 'Porte',
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
    defineField({
      name: 'runwayLengthMeters',
      title: 'Comprimento da pista (metros)',
      type: 'number',
      validation: (rule) => rule.required().integer().positive(),
    }),
    defineField({
      name: 'aircraftCategories',
      title: 'Aeronaves permitidas',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'string',
        }),
      ],
      options: {
        list: [
          {title: 'Helicópteros', value: 'helicopter'},
          {title: 'Pistão', value: 'piston'},
          {title: 'Turboélice', value: 'turboprop'},
          {title: 'Jato leve', value: 'light_jet'},
          {title: 'Jato médio', value: 'midsize_jet'},
          {title: 'Jato pesado', value: 'heavy_jet'},
          {title: 'Todas as categorias', value: 'all'},
        ],
      },
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'privateOperations',
      title: 'Operações privadas',
      type: 'boolean',
      initialValue: true,
      description: 'Indica que o aeroporto pode ser considerado pelo catálogo de voos particulares.',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'code',
      city: 'city',
      state: 'state',
    },
    prepare({title, subtitle, city, state}) {
      return {
        title: `${subtitle} – ${title}`,
        subtitle: `${city}, ${state}`,
      }
    },
  },
})
