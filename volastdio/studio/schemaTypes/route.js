import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'route',
  title: 'Rota',
  type: 'document',
  fields: [
    defineField({
      name: 'originAirport',
      title: 'Aeroporto de origem',
      type: 'reference',
      to: [{type: 'airport'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'destinationAirport',
      title: 'Aeroporto de destino',
      type: 'reference',
      to: [{type: 'airport'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'distance',
      title: 'Distância (km)',
      type: 'number',
      validation: (rule) => rule.required().positive().precision(1),
    }),
  ],
  preview: {
    select: {
      originCode: 'originAirport.code',
      originCity: 'originAirport.city',
      destinationCode: 'destinationAirport.code',
      destinationCity: 'destinationAirport.city',
    },
    prepare({originCode, originCity, destinationCode, destinationCity}) {
      return {
        title: `${originCode} → ${destinationCode}`,
        subtitle: `${originCity} - ${destinationCity}`,
      }
    },
  },
})
