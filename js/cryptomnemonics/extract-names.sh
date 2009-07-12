#!/bin/bash
#currently, we use 9 male, 9 female, 14 last name bits:
#we need 512 male first, 512 female first and 16384 last names
#total combination of male/female/last: 32 bit
#problem: in each array, a the last string has a trailing comma, which is forbidden in json
echo 'names={};' > names.js; 
echo 'names.male = [' >> names.js; 
for i in `head -n 512 dist.male.first | awk '{ print $1; }'`; 
  do echo "  \"$i\"," >> names.js; 
done;
echo ']' >> names.js
echo 'names.female = [' >> names.js; 
for i in `head -n 512 dist.female.first | awk '{ print $1; }'`;
  do echo "  \"$i\"," >> names.js
done;
echo ']' >> names.js
echo 'names.last = [' >> names.js; 
for i in `head -n 16384 dist.all.last | awk '{ print $1; }'`;
  do echo "  \"$i\"," >> names.js
done;
echo ']' >> names.js