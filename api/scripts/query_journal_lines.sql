select id, "entryId", "accountCode", debit, credit, description
from "JournalLine"
order by id desc
limit 20;
