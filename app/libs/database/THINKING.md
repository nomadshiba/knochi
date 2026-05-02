## Ideas to consider
- component doesn't have a name it has a table name, can just be called `table`.
- then it has shape, we also accept `StructField` as shape as well.
- many things can both accept array and spreading as well. 

## Syntax

```ts
const Position = Component({
    name: "position",
    shape: Vector3,
    zero() {
        return { x: 0, y: 0, z: 0 };
    },
});

const Player = Tag("player");
const Banned = Tag("banned");

const entity = await nest.create(
    Player,
    Position.create({ x: 0, y: 0, z: 0 }),
);

await nest.exist(entity); // true
await nest.destroy(entity);
await nest.exist(entity); // false

const Health = Component({
    name: "health",
    shape: { value: IntegerField() }, // shape or struct field
});

await nest.add(entity, Health.of(100));
await nest.set(entity, Health.of(50));
await nest.remove(entity, Health);

const query = nest.query(({ ref, with, every, some, none }) => every(
    with(User), // tag
    some(with(HasName).of({ eq: "mike" }), with(HasName).of({ eq: "joe" })),
    with(HasAge).of({ gte: 18 }), // .of() lets you define field operators like tuple instead of struct. which also simplifies working with one field components. 
    with(HasBoss).of(every(with(HasAge).of({ gte: 60 }), with(HasName).of({ eq: "john" }))),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
)).select(User, HasName);
await query.take(10).drop(5).toArray();
await query.first();
for await (const [entity, { value: name }] of query) {}

const query = nest.query(({ ref, with, every, some, none }) => every(
    with(User).has({
        name: { some: [{ eq: "mike" }, { eq: "joe" }] },
        age: { gte: 18 },
        boss: { has: { name: "john" age: { gte: { 60 } } } }
    }),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
)).select(User);

for await (const [entity, user] of query) {}

nest.query(({ ref, with, every, some, none }) => every(
    with(User).has({
        name: { in: ["mike", "joe"] },
        age: { gte: 18 },
        boss: { has: { name: "john" age: { gte: { 60 } } } }
    }),
    ref(GroupMember).by("user").has({
        role: { eq: "foo" },
    }),
)).select(User);
```

based on the type of the reference field, we can decide if it should be inlined or only extended manually during get. during query, we
should have no option to change shape of the components, if you are getting the component you are getting it, end of story.
