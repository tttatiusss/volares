import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'flight',
  title: 'Voo',
  type: 'document',
  fields: [
    defineField({
      name: 'airline',
      title: 'Companhia aérea',
      type: 'reference',
      to: [{type: 'airline'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'route',
      title: 'Rota',
      type: 'reference',
      to: [{type: 'route'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'departureTime',
      title: 'Hora de partida',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'arrivalTime',
      title: 'Hora de chegada',
      type: 'datetime',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'duration',
      title: 'Duração (minutos)',
      type: 'number',
      validation: (rule) => rule.required().integer().positive(),
    }),
    defineField({
      name: 'price',
      title: 'Preço',
      type: 'number',
      validation: (rule) => rule.required().positive().precision(2),
    }),
    defineField({
      name: 'currency',
      title: 'Moeda',
      type: 'string',
      initialValue: 'BRL',
      options: {
        list: [
          {title: 'Real brasileiro (BRL)', value: 'BRL'},
          {title: 'Dólar americano (USD)', value: 'USD'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'totalSeats',
      title: 'Total de assentos',
      type: 'number',
      validation: (rule) => rule.required().integer().positive().max(100),
    }),
    defineField({
      name: 'availableSeats',
      title: 'Assentos disponíveis',
      type: 'number',
      validation: (rule) => rule.required().integer().min(0),
    }),
    defineField({
      name: 'aircraft',
      title: 'Aeronave',
      type: 'reference',
      to: [{type: 'aircraft'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'seatClass',
      title: 'Classe de assento',
      type: 'array',
      of: [
        defineField({
          name: 'seatClassItem',
          title: 'Classe',
          type: 'object',
          fields: [
            defineField({
              name: 'name',
              title: 'Nome',
              type: 'string',
              options: {
                list: [
                  {title: 'Executiva', value: 'executiva'},
                  {title: 'Primeira classe', value: 'primeira'},
                  {title: 'Privado', value: 'privado'},
                ],
              },
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'capacity',
              title: 'Capacidade',
              type: 'number',
              validation: (rule) => rule.required().integer().positive(),
            }),
          ],
          preview: {
            select: {
              title: 'name',
              subtitle: 'capacity',
            },
            prepare({title, subtitle}) {
              return {
                title: title || 'Classe',
                subtitle: subtitle ? `${subtitle} assentos` : '',
              }
            },
          },
        }),
      ],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      initialValue: 'scheduled',
      options: {
        list: [
          {title: 'Agendado', value: 'scheduled'},
          {title: 'Em confirmação', value: 'confirming'},
          {title: 'Confirmado', value: 'confirmed'},
          {title: 'Em voo', value: 'in_flight'},
          {title: 'Concluído', value: 'completed'},
          {title: 'Cancelado', value: 'cancelled'},
        ],
        layout: 'radio',
      },
      validation: (rule) => rule.required(),
    }),
  ],
  validation: (rule) =>
    rule.custom((document) => {
      if (!document) return true
      if (
        typeof document.totalSeats === 'number' &&
        typeof document.availableSeats === 'number' &&
        document.availableSeats > document.totalSeats
      ) {
        return 'Assentos disponíveis não podem exceder o total de assentos.'
      }
      if (
        document.departureTime &&
        document.arrivalTime &&
        new Date(document.arrivalTime).getTime() <= new Date(document.departureTime).getTime()
      ) {
        return 'A hora de chegada deve ser posterior à hora de partida.'
      }
      return true
    }),
  preview: {
    select: {
      departureTime: 'departureTime',
      aircraft: 'aircraft.modelo',
      status: 'status',
      airlineName: 'airline.name',
      originCode: 'route.originAirport.code',
      destinationCode: 'route.destinationAirport.code',
    },
    prepare({departureTime, aircraft, status, airlineName, originCode, destinationCode}) {
      const date = departureTime
        ? new Date(departureTime).toLocaleString('pt-BR')
        : 'Sem data'

      return {
        title: `${originCode || 'Origem'} → ${destinationCode || 'Destino'} • ${airlineName || 'Companhia'}`,
        subtitle: `${date} • ${aircraft || 'Aeronave'} • ${status || ''}`,
      }
    },
  },
})
